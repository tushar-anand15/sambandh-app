"""CSV downloads — exactly the rows the JSON endpoint returned, unrounded.

Every figure on screen has to be downloadable, and the download has to agree
with the screen to the rupee (R9). The way that is guaranteed here is not
discipline but construction: each section's CSV is written from the very same
payload function the JSON endpoint calls, so a column cannot drift out of sync
without both changing together.

Nothing is formatted. No crore, no lakh, no thousands separators, no rounding —
those are presentation, and a CSV is not a presentation.

A section with nothing to show answers 404 carrying the same ``reason`` its JSON
endpoint states, rather than a zero-byte file that reads as a broken download.
The page knows the section is unavailable before it renders the button.
"""

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Request

from ..database import get_pool
from ..public import VALID_CYCLES, YEAR_PATTERN, fetch_body, fetch_year, public_csv, rate_limit
from . import elections as elections_router
from . import finances as finances_router
from . import meetings as meetings_router

router = APIRouter(prefix="/api/download", tags=["public"], dependencies=[Depends(rate_limit)])

COLUMNS: dict[str, tuple[str, ...]] = {
    "finances": ("project_no", "project_name", "formulation", "expense", "has_pdf", "pdf_path"),
    "meetings": (
        "meeting_date",
        "meeting_no",
        "meeting_type",
        "meeting_nature",
        "venue",
        "category_code",
    ),
    "elections": (
        "ward_no",
        "ward_name",
        "reservation",
        "winner_name",
        "winner_party",
        "winner_front",
        "winner_votes",
        "runnerup_name",
        "runnerup_votes",
        "margin",
        "margin_pct",
        "valid_votes",
        "invalid_votes",
        "candidates",
    ),
}

ROW_KEY = {"finances": "project_rows", "meetings": "meeting_rows", "elections": "wards"}


def _render(section: str, rows: list[dict[str, Any]]) -> str:
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\n")
    columns = COLUMNS[section]
    writer.writerow(columns)
    for row in rows:
        writer.writerow(["" if row.get(c) is None else row[c] for c in columns])
    return out.getvalue()


@router.get("/{section}/{lb_code}/{period}.csv")
async def download(
    request: Request,
    lb_code: str,
    section: str = Path(pattern="^(finances|meetings|elections)$"),
    period: str = Path(description="A financial year like 2023-2024, or an election cycle like 2020"),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        body = await fetch_body(conn, lb_code)

        if section == "elections":
            if not period.isdigit() or int(period) not in VALID_CYCLES:
                raise HTTPException(
                    status_code=422,
                    detail=f"{period} is not a local-body election cycle. "
                    f"Cycles are {', '.join(str(c) for c in VALID_CYCLES)}.",
                )
            payload = await elections_router.cycle_payload(conn, body, int(period))
        else:
            import re

            if not re.match(YEAR_PATTERN, period):
                raise HTTPException(
                    status_code=422,
                    detail=f"{period} is not a financial year. Years look like 2023-2024.",
                )
            year = await fetch_year(conn, period)
            module = finances_router if section == "finances" else meetings_router
            payload = await module.year_payload(conn, body, year)

    if not payload.get("available"):
        raise HTTPException(status_code=404, detail=payload["reason"])

    return public_csv(
        request,
        _render(section, payload[ROW_KEY[section]]),
        filename=f"{section}_{lb_code}_{period}.csv",
    )
