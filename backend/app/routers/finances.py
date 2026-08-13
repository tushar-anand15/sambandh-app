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

Each project row carries ``pdf_url``, a signed Cloud Storage URL good for an
hour, alongside the stable ``pdf_path``. Where the deployment holds no signing
key, ``pdf_url`` is null for every row and ``pdf_url_reason`` says so once. See
``app/presign.py``.
"""

from typing import Any

from fastapi import APIRouter, Depends, Path, Request
from starlette.concurrency import run_in_threadpool

from ..database import get_pool
from ..presign import document_signer
from ..public import (
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


async def project_rows(conn, lb_key: int, year_label: str) -> list[dict[str, Any]]:
    """The on-screen table, unrounded. The CSV download reads this same list.

    Each row carries both the object path and a signed URL for it. The path is
    what the CSV keeps, because it is stable; the URL expires within the hour
    and belongs only to the page that is open now.

    Signing is RSA over a local key, so a 357-row body-year costs about a
    quarter of a second of CPU. That runs in a worker thread: a public endpoint
    that blocks the event loop for a quarter of a second blocks every other
    request on the process for that quarter second too.
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
            "pdf_url": urls.get(r["pdf_gcs_path"]) if r["pdf_gcs_path"] else None,
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

    rows = await project_rows(conn, body["lb_key"], year["year_label"])
    signer = document_signer()

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
        # Null where every document has an address. Where one does not, this is
        # the sentence saying why, so the page states a cause instead of
        # printing a dead column.
        "pdf_url_reason": None if signer.available else signer.reason,
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
