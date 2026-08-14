"""Meetings — counts by category and by nature, the meeting list, and the
documents each meeting published.

Sakarma publishes a decision register (``dr.html``) and minutes
(``minutes.html``) per meeting, in ``gs://sulekhasakarma-meetings``. Both are
already readable documents, so this router serves them rather than parsing
them: ``/register/{meeting_id}/{kind}`` fetches the object and returns it
sanitised, and ``app/artifacts.py`` holds that rewrite.

The distinction the year endpoint exists to preserve: Sakarma's coverage grows
from 8,989 meetings across 545 bodies in 2016-17 to 91,478 across 1,197 in
2024-25. A body-year with no row is almost always a thin record, not a council
that never met. ``/api/bodies`` now names which years each body has, so the
year control can stop offering the empty combinations, and this endpoint
answers the few that remain in one sentence.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Request

from ..artifacts import (
    KIND_LABEL,
    KINDS,
    ArtifactUnavailable,
    download,
    is_empty,
    sanitise,
)
from ..database import get_pool
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

router = APIRouter(prefix="/api/meetings", tags=["public"], dependencies=[Depends(rate_limit)])

NOT_COVERED_REASON = "Sakarma publishes no meetings for this local body."

# What a reader can open from the list, counted from the master database.
SCOPE_NOTE = (
    "Sakarma publishes a decision register and minutes for 420,561 of its "
    "443,235 meetings. Both open from the list below."
)

# A document Sakarma names but the bucket has nothing for.
NO_DOCUMENT = "no_document_published"


def _no_record_reason(year_label: str) -> str:
    return f"Sakarma publishes no meetings for {year_label}."


async def meeting_rows(conn, lb_key: int, year_label: str) -> list[dict[str, Any]]:
    """The register's rows, each naming the documents it published.

    The artifact join is one grouped scan over ``artifact_meeting_id_...idx``
    for the body-year's meetings, so the list costs one query however many
    meetings it holds.
    """
    rows = await conn.fetch(
        """
        SELECT m.meeting_id, m.meeting_date, m.meeting_no_label, m.meeting_type,
               m.meeting_nature, m.meeting_venue, m.category,
               coalesce(
                   array_agg(DISTINCT a.artifact_type)
                       FILTER (WHERE a.artifact_type IS NOT NULL),
                   '{}'
               ) AS artifact_types
        FROM meetings.meeting m
        LEFT JOIN meetings.artifact a ON a.meeting_id = m.meeting_id
        WHERE m.lb_key = $1 AND m.year_label = $2
        GROUP BY m.meeting_id
        ORDER BY m.meeting_date, m.meeting_id
        """,
        lb_key,
        year_label,
    )
    return [
        {
            "meeting_id": r["meeting_id"],
            "meeting_date": r["meeting_date"].isoformat() if r["meeting_date"] else None,
            "meeting_no": r["meeting_no_label"],
            "meeting_type": r["meeting_type"],
            "meeting_nature": r["meeting_nature"],
            # Null often enough to matter; the page renders an absence, not "—".
            "venue": r["meeting_venue"],
            "category_code": r["category"],
            # The URL segments the register endpoint takes, for the documents
            # this meeting actually has.
            "documents": [
                kind
                for kind, artifact_type in KINDS.items()
                if artifact_type in r["artifact_types"]
            ],
        }
        for r in rows
    ]


async def year_payload(conn, body, year) -> dict[str, Any]:
    """One body-year, shared by the JSON endpoint and the CSV download."""
    base = {"lb_code": body["lb_code"], **year_block(year), "body": body_block(body)}

    if not body["has_meetings"]:
        return unavailable("meetings", NOT_COVERED, NOT_COVERED_REASON, **base)

    summary = await conn.fetchrow(
        """
        SELECT meetings, governing_body, standing_committee, ordinary, special,
               first_meeting, last_meeting
        FROM meetings.lb_year_summary
        WHERE lb_key = $1 AND year_label = $2
        """,
        body["lb_key"],
        year["year_label"],
    )

    if summary is None:
        return unavailable(
            "meetings",
            NO_RECORD_FOR_YEAR,
            _no_record_reason(year["year_label"]),
            **base,
        )

    return {
        **base,
        "available": True,
        "reason_code": None,
        "meetings": as_number(summary["meetings"]),
        # By category: who met.
        "governing_body": as_number(summary["governing_body"]),
        "standing_committee": as_number(summary["standing_committee"]),
        # By nature: how the meeting was called.
        "ordinary": as_number(summary["ordinary"]),
        "special": as_number(summary["special"]),
        "first_meeting": summary["first_meeting"].isoformat() if summary["first_meeting"] else None,
        "last_meeting": summary["last_meeting"].isoformat() if summary["last_meeting"] else None,
        "meeting_rows": await meeting_rows(conn, body["lb_key"], year["year_label"]),
        "scope_note": SCOPE_NOTE,
        "provenance": provenance("meetings"),
    }


# ---------------------------------------------------------------------------
# The documents themselves
# ---------------------------------------------------------------------------

# Declared before ``/{lb_code}/{year_label}`` for readability only: the two
# never collide, because a body-year is two path segments and this is three.
@router.get("/register/{meeting_id}/{kind}")
async def meeting_document(request: Request, meeting_id: int, kind: str):
    """One meeting's decision register or minutes, sanitised.

    The bytes are proxied rather than signed for. Signing needs a service
    account with access to ``gs://sulekhasakarma-meetings``, and the rewrite in
    ``app/artifacts.py`` has to run server-side whether or not one is available,
    so a signed URL would move the same bytes through a second hop.
    """
    if kind not in KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"{kind} is not a document type. Ask for dr or minutes.",
        )

    pool = await get_pool()
    async with pool.acquire() as conn:
        meeting = await conn.fetchrow(
            """
            SELECT m.meeting_id, m.meeting_date, m.meeting_no_label, m.meeting_type,
                   m.meeting_nature, m.year_label, lb.lb_code, lb.lb_name_en,
                   lb.lb_name_ml, lb.district_name, lb.lb_type
            FROM meetings.meeting m
            JOIN core.local_body lb USING (lb_key)
            WHERE m.meeting_id = $1
            """,
            meeting_id,
        )
        if meeting is None:
            raise HTTPException(
                status_code=404, detail=f"No meeting with id {meeting_id}"
            )

        artifact = await conn.fetchrow(
            "SELECT gcs_path, byte_size FROM meetings.artifact "
            "WHERE meeting_id = $1 AND artifact_type = $2 "
            "ORDER BY artifact_id LIMIT 1",
            meeting_id,
            KINDS[kind],
        )

    head = {
        "meeting_id": meeting_id,
        "kind": kind,
        "kind_label": KIND_LABEL[kind],
        "year_label": meeting["year_label"],
        "meeting_date": meeting["meeting_date"].isoformat()
        if meeting["meeting_date"]
        else None,
        "meeting_no": meeting["meeting_no_label"],
        "meeting_type": meeting["meeting_type"],
        "meeting_nature": meeting["meeting_nature"],
        "body": body_block(meeting),
    }

    if artifact is None:
        return public_json(
            request,
            unavailable(
                "meetings",
                NO_DOCUMENT,
                f"Sakarma published no {KIND_LABEL[kind].lower()} for this meeting.",
                **head,
            ),
        )

    try:
        raw = download(artifact["gcs_path"])
    except ArtifactUnavailable as err:
        raise HTTPException(
            status_code=502,
            detail=(
                f"The {KIND_LABEL[kind].lower()} for this meeting could not be "
                "opened. Try again in a moment."
            ),
        ) from err

    html = sanitise(raw)
    if is_empty(html):
        return public_json(
            request,
            unavailable(
                "meetings",
                NO_DOCUMENT,
                f"The {KIND_LABEL[kind].lower()} Sakarma published for this "
                "meeting is an empty document.",
                **head,
            ),
        )

    return public_json(
        request,
        {
            **head,
            "available": True,
            "reason_code": None,
            "html": html,
            "source_path": artifact["gcs_path"],
            "byte_size": as_number(artifact["byte_size"]),
            "provenance": provenance("meetings"),
        },
    )


@router.get("/{lb_code}/{year_label}")
async def meetings_year(
    request: Request,
    lb_code: str,
    year_label: str = Path(pattern=YEAR_PATTERN),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        body = await fetch_body(conn, lb_code)
        year = await fetch_year(conn, year_label)
        return public_json(request, await year_payload(conn, body, year))
