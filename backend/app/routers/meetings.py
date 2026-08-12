"""Meetings — counts by category and by nature, and the meeting list.

Manifest metadata only. Sakarma publishes a decision register (``dr.html``) and
attachments for each meeting; neither is parsed, so nothing here reports agenda
items, decisions or funding. The page says so; this endpoint carries the note
so the page does not have to hardcode it.

The distinction this endpoint exists to preserve: Sakarma's coverage grows from
8,989 meetings across 545 bodies in 2016-17 to 91,478 across 1,197 in 2024-25.
A body-year with no row is almost always a thin record, not a council that
never met, and the payload has to let the page say which.
"""

from typing import Any

from fastapi import APIRouter, Depends, Path, Request

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

NOT_COVERED_REASON = "Sakarma holds no meeting record for this body."

SCOPE_NOTE = (
    "Sakarma's decision registers and meeting attachments are published but not "
    "yet parsed, so this page shows meeting metadata only."
)


def _no_record_reason(year_label: str, first: str | None, last: str | None) -> str:
    if first and last:
        return (
            f"Sakarma holds no meeting record for {year_label}. "
            f"This body's record runs from {first} to {last}."
        )
    return f"Sakarma holds no meeting record for {year_label}."


async def meeting_rows(conn, lb_key: int, year_label: str) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT meeting_date, meeting_no_label, meeting_type, meeting_nature,
               meeting_venue, category
        FROM meetings.meeting
        WHERE lb_key = $1 AND year_label = $2
        ORDER BY meeting_date, meeting_id
        """,
        lb_key,
        year_label,
    )
    return [
        {
            "meeting_date": r["meeting_date"].isoformat() if r["meeting_date"] else None,
            "meeting_no": r["meeting_no_label"],
            "meeting_type": r["meeting_type"],
            "meeting_nature": r["meeting_nature"],
            # Null often enough to matter; the page renders an absence, not "—".
            "venue": r["meeting_venue"],
            "category_code": r["category"],
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
        bounds = await conn.fetchrow(
            "SELECT min(year_label) AS first, max(year_label) AS last "
            "FROM meetings.lb_year_summary WHERE lb_key = $1",
            body["lb_key"],
        )
        return unavailable(
            "meetings",
            NO_RECORD_FOR_YEAR,
            _no_record_reason(year["year_label"], bounds["first"], bounds["last"]),
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
