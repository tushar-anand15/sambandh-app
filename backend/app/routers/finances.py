"""Finances — the fourteen-year series, and one year in full.

Both figures on this page come from ``finance.lb_year_summary`` and
``finance.lb_year_continuity``, which are materialised per body-year precisely
so this endpoint is one select. ``finance.project`` is read only for the
on-screen project table, never to compute a total: the table holds 3.6 million
rows and aggregating it per request would put a public page one scrape away
from taking the database down.

What this section deliberately does not carry: any sector, sub-sector or
category. Nothing in the source classifies a project, and no proxy is
substituted (see the plan's scope boundaries).

Each project row carries ``pdf_url`` alongside the stable ``pdf_path``. Where
the deployment holds a signing key, that URL is a signed Cloud Storage address
good for an hour and the browser fetches the scan from Cloud Storage. Where it
does not, the URL points at ``/documents/{project_no}`` below, which streams the
object through this API on whatever identity the process is running as.
``pdf_url_reason`` is filled in only when neither works. See ``app/presign.py``.

The client never names an object. It names a body, a year and a project number,
and the path is read from ``finance.project``: a path taken from a caller is a
bucket traversal one crafted string away.
"""

import re
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from ..database import get_pool
from ..presign import (
    NO_ACCESS_REASON,
    DocumentMissing,
    DocumentUnreadable,
    document_signer,
    documents_readable,
    open_document,
    stream_document,
)
from ..public import (
    CACHE_CONTROL,
    NO_RECORD_FOR_YEAR,
    NOT_COVERED,
    YEAR_PATTERN,
    as_number,
    body_block,
    fetch_body,
    fetch_year,
    provenance,
    public_json,
    rate_limit,
    unavailable,
    year_block,
)

router = APIRouter(prefix="/api/finances", tags=["public"], dependencies=[Depends(rate_limit)])

NOT_COVERED_REASON = "Sulekha holds no plan record for this body."

# Every project_no in finance.project is digits, and the lookup is by column
# value rather than by string interpolation, so this pattern is a cheap reject
# of junk rather than the thing keeping the bucket safe.
PROJECT_NO_PATTERN = "^[A-Za-z0-9._-]{1,50}$"


def _no_record_reason(year_label: str, first: str | None, last: str | None) -> str:
    if first and last:
        return (
            f"Sulekha records no projects for {year_label}. "
            f"This body's plan record runs from {first} to {last}."
        )
    return f"Sulekha records no projects for {year_label}."


async def series_rows(conn, lb_key: int) -> list[dict[str, Any]]:
    """One row per financial year, present or absent.

    Every year appears, including the ones with nothing in them, because a gap
    in a fourteen-year chart is information — dropping the row would let the
    chart draw a continuous line across a year the portal simply has no data
    for.
    """
    rows = await conn.fetch(
        """
        SELECT fy.year_label,
               fy.is_complete,
               s.projects,
               s.formulation,
               s.expense,
               s.expense_pct,
               s.projects_with_pdf,
               c.distinct_projects,
               c.also_in_prev_year,
               c.first_seen_this_year
        FROM core.financial_year fy
        LEFT JOIN finance.lb_year_summary   s ON s.lb_key = $1 AND s.year_label = fy.year_label
        LEFT JOIN finance.lb_year_continuity c ON c.lb_key = $1 AND c.year_label = fy.year_label
        ORDER BY fy.year_label
        """,
        lb_key,
    )
    return [
        {
            "year_label": r["year_label"],
            "is_complete": r["is_complete"],
            "has_data": r["projects"] is not None,
            "projects": as_number(r["projects"]),
            "formulation": as_number(r["formulation"]),
            "expense": as_number(r["expense"]),
            "expense_pct": as_number(r["expense_pct"]),
            "projects_with_pdf": as_number(r["projects_with_pdf"]),
            "also_in_prev_year": as_number(r["also_in_prev_year"]),
            "first_seen_this_year": as_number(r["first_seen_this_year"]),
        }
        for r in rows
    ]


def document_url(lb_code: str, year_label: str, project_no: str | None) -> str | None:
    """The proxy address of one project's document on this API.

    Relative, so it works behind whatever host and scheme the site is served
    on, and built from the three identifiers the row already carries rather
    than from the object path, which never leaves the server.
    """
    if project_no is None:
        return None
    return f"/api/finances/{lb_code}/{year_label}/documents/{quote(project_no, safe='')}"


async def project_rows(
    conn, lb_key: int, lb_code: str, year_label: str
) -> list[dict[str, Any]]:
    """The on-screen table, unrounded. The CSV download reads this same list.

    Each row carries the stable object path and an address for it. The path is
    what the CSV keeps; the address is either a signed Cloud Storage URL, which
    expires within the hour and belongs only to the page open now, or this
    API's own proxy route, which does not expire and holds no object path.

    Signing is RSA over a local key, so a 357-row body-year costs about a
    quarter of a second of CPU. That runs in a worker thread: a public endpoint
    that blocks the event loop for a quarter of a second blocks every other
    request on the process for that quarter second too. Proxy addresses are
    string formatting and cost nothing.
    """
    rows = await conn.fetch(
        """
        SELECT project_no, project_name, formulation, expense, has_pdf, pdf_gcs_path
        FROM finance.project
        WHERE lb_key = $1 AND year_label = $2
        ORDER BY project_no, project_id
        """,
        lb_key,
        year_label,
    )

    signer = document_signer()
    paths = [r["pdf_gcs_path"] for r in rows if r["pdf_gcs_path"]]
    urls = await run_in_threadpool(signer.sign_paths, paths) if paths else {}
    proxying = not signer.available and await run_in_threadpool(documents_readable)

    def address(row) -> str | None:
        if not row["pdf_gcs_path"]:
            return None
        if proxying:
            return document_url(lb_code, year_label, row["project_no"])
        return urls.get(row["pdf_gcs_path"])

    return [
        {
            "project_no": r["project_no"],
            "project_name": r["project_name"],
            "formulation": as_number(r["formulation"]),
            "expense": as_number(r["expense"]),
            # Roughly 54% of projects have a PDF. The other 46% need a quiet
            # absent state, not a link that 404s.
            "has_pdf": bool(r["has_pdf"]),
            "pdf_path": r["pdf_gcs_path"],
            "pdf_url": address(r),
        }
        for r in rows
    ]


async def year_payload(conn, body, year) -> dict[str, Any]:
    """One body-year, shared by the JSON endpoint and the CSV download."""
    base = {"lb_code": body["lb_code"], **year_block(year), "body": body_block(body)}

    if body["years_with_finance"] == 0:
        return unavailable("finances", NOT_COVERED, NOT_COVERED_REASON, **base)

    summary = await conn.fetchrow(
        """
        SELECT s.projects, s.formulation, s.expense, s.expense_pct, s.projects_with_pdf,
               c.distinct_projects, c.also_in_prev_year, c.first_seen_this_year
        FROM finance.lb_year_summary s
        LEFT JOIN finance.lb_year_continuity c
               ON c.lb_key = s.lb_key AND c.year_label = s.year_label
        WHERE s.lb_key = $1 AND s.year_label = $2
        """,
        body["lb_key"],
        year["year_label"],
    )

    if summary is None:
        bounds = await conn.fetchrow(
            "SELECT min(year_label) AS first, max(year_label) AS last "
            "FROM finance.lb_year_summary WHERE lb_key = $1",
            body["lb_key"],
        )
        return unavailable(
            "finances",
            NO_RECORD_FOR_YEAR,
            _no_record_reason(year["year_label"], bounds["first"], bounds["last"]),
            **base,
        )

    rows = await project_rows(
        conn, body["lb_key"], body["lb_code"], year["year_label"]
    )
    signer = document_signer()
    reachable = signer.available or await run_in_threadpool(documents_readable)

    return {
        **base,
        "available": True,
        "reason_code": None,
        "projects": as_number(summary["projects"]),
        "formulation": as_number(summary["formulation"]),
        "expense": as_number(summary["expense"]),
        "expense_pct": as_number(summary["expense_pct"]),
        "projects_with_pdf": as_number(summary["projects_with_pdf"]),
        "distinct_projects": as_number(summary["distinct_projects"]),
        "also_in_prev_year": as_number(summary["also_in_prev_year"]),
        "first_seen_this_year": as_number(summary["first_seen_this_year"]),
        "project_rows": rows,
        # Null where every document has an address, whether that address is a
        # signed URL or this API's proxy route. A sentence only where neither
        # is available, so the page states a cause instead of printing a dead
        # column, and never states one while the documents open.
        "pdf_url_reason": None if reachable else NO_ACCESS_REASON,
        # Stated on the page, not implied by its absence.
        "classification": None,
        "classification_note": "Sulekha publishes no sector or category for a project, and none is inferred here.",
        "provenance": provenance("finances"),
    }


@router.get("/{lb_code}")
async def finances_series(request: Request, lb_code: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        body = await fetch_body(conn, lb_code)
        base = {"lb_code": body["lb_code"], "body": body_block(body)}

        if body["years_with_finance"] == 0:
            return public_json(
                request, unavailable("finances", NOT_COVERED, NOT_COVERED_REASON, **base)
            )

        years = await series_rows(conn, body["lb_key"])

    return public_json(
        request,
        {
            **base,
            "available": True,
            "reason_code": None,
            "years": years,
            "years_with_finance": body["years_with_finance"],
            "provenance": provenance("finances"),
        },
    )


# ---------------------------------------------------------------------------
# The documents themselves
# ---------------------------------------------------------------------------

_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


def _range(header: str | None, length: int) -> tuple[int, int] | None:
    """One byte range, or ``None`` for the whole object.

    Only the single-range forms are honoured: ``bytes=0-1023``, ``bytes=1024-``
    and ``bytes=-1024``. A multipart range is answered with the whole object,
    which RFC 9110 allows and which no PDF viewer asks for. A range that starts
    past the end raises 416, because answering it with the whole file would
    have the viewer read the wrong bytes at the offset it asked about.
    """
    if not header:
        return None
    match = _RANGE.match(header.strip())
    if not match or length == 0:
        return None

    first, last = match.group(1), match.group(2)
    if not first:
        if not last:
            return None
        start, end = max(0, length - int(last)), length - 1
    else:
        start = int(first)
        end = min(int(last), length - 1) if last else length - 1

    if start > end or start >= length:
        raise HTTPException(
            status_code=416,
            detail=f"{header} does not lie inside this document, which is {length} bytes.",
            headers={"Content-Range": f"bytes */{length}"},
        )
    return start, end


@router.get("/{lb_code}/{year_label}/documents/{project_no}")
async def project_document(
    request: Request,
    lb_code: str,
    year_label: str = Path(pattern=YEAR_PATTERN),
    project_no: str = Path(pattern=PROJECT_NO_PATTERN),
):
    """One project's sanctioning document, streamed from the bucket.

    This route exists for the deployments that can read ``gs://`` and cannot
    sign for it. Where a signing key is configured the payload's ``pdf_url``
    addresses Cloud Storage directly and nothing reaches this route, so the
    bytes stay off the app.

    The caller names a body, a year and a project number. The object path is
    read from ``finance.project`` and never comes off the request, so no string
    a caller can write reaches the bucket.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        body = await fetch_body(conn, lb_code)
        row = await conn.fetchrow(
            "SELECT project_name, has_pdf, pdf_gcs_path FROM finance.project "
            "WHERE lb_key = $1 AND year_label = $2 AND project_no = $3",
            body["lb_key"],
            year_label,
            project_no,
        )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Sulekha records no project {project_no} for "
            f"{body['lb_code']} in {year_label}.",
        )
    if not row["pdf_gcs_path"]:
        raise HTTPException(
            status_code=404,
            detail=f"Project {project_no} was published as a plan line with no "
            "document attached.",
        )

    path = row["pdf_gcs_path"]
    try:
        blob = await run_in_threadpool(open_document, path)
    except DocumentMissing as missing:
        raise HTTPException(
            status_code=404,
            detail=f"The document for project {project_no} is recorded at {path} "
            "and the bucket holds nothing there.",
        ) from missing
    except DocumentUnreadable as unreadable:
        raise HTTPException(
            status_code=502,
            detail=f"The document for project {project_no} is recorded at {path} "
            f"and could not be read from the bucket: {unreadable}",
        ) from unreadable

    length = blob.size or 0
    window = _range(request.headers.get("range"), length)
    start, end = window if window else (0, max(0, length - 1))

    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": CACHE_CONTROL,
        # Inline: the reader opened a drawer beside a table, not a download.
        # The filename is what a browser's own save action then writes.
        "Content-Disposition": (
            f'inline; filename="{lb_code}_{year_label}_project_{project_no}.pdf"'
        ),
    }
    if length:
        headers["Content-Length"] = str(end - start + 1)
    if window:
        headers["Content-Range"] = f"bytes {start}-{end}/{length}"

    return StreamingResponse(
        stream_document(blob, start, end if length else None),
        status_code=206 if window else 200,
        media_type="application/pdf",
        headers=headers,
    )


@router.get("/{lb_code}/{year_label}")
async def finances_year(
    request: Request,
    lb_code: str,
    year_label: str = Path(pattern=YEAR_PATTERN),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        body = await fetch_body(conn, lb_code)
        year = await fetch_year(conn, year_label)
        return public_json(request, await year_payload(conn, body, year))
