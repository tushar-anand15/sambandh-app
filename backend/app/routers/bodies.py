"""The selector list — every local body, with what each section holds for it.

One request, cached hard, read once by the frontend and reused by all three
data sections. The per-section flags are the point: a visitor should never be
offered a Meetings view for a body Sakarma has no record of, and the reason
that view is missing should be stateable without a second round trip.

The same argument runs one level down, which is why each body carries the
financial years it has a record for rather than a count of them. Ala Grama
Panchayat's meeting record starts in 2016-17; offering 2015-16 in the year
control and then explaining the absence is worse than not offering it. A count
cannot drive that control. A list can.

Two grouped scans supply the lists for all 1,238 bodies — one over
``finance.lb_year_summary`` (16,828 rows) and one over
``meetings.lb_year_summary`` (11,070 rows), both index-only, together under
5 ms. The counts stay in the payload and are derived from the lists, so the
two cannot disagree.
"""

from fastapi import APIRouter, Depends, Request

from ..database import get_pool
from ..public import BODY_SQL, provenance, public_json, rate_limit

router = APIRouter(prefix="/api/bodies", tags=["public"], dependencies=[Depends(rate_limit)])

YEARS_SQL = """
    SELECT lb_key, array_agg(year_label ORDER BY year_label) AS years
    FROM {table}
    GROUP BY lb_key
"""


async def _years_by_body(conn, table: str) -> dict[int, list[str]]:
    rows = await conn.fetch(YEARS_SQL.format(table=table))
    return {r["lb_key"]: list(r["years"]) for r in rows}


@router.get("")
async def list_bodies(request: Request):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(BODY_SQL + " ORDER BY lb.district_ord, lb.lb_name_en")
        years = await conn.fetch(
            "SELECT year_label, is_complete FROM core.financial_year ORDER BY year_label"
        )
        finance_years = await _years_by_body(conn, "finance.lb_year_summary")
        meeting_years = await _years_by_body(conn, "meetings.lb_year_summary")

    bodies = [
        {
            "lb_code": r["lb_code"],
            "lb_name_en": r["lb_name_en"],
            "lb_name_ml": r["lb_name_ml"],
            "district_name": r["district_name"],
            # The tier — Grama Panchayat, Block Panchayat, District Panchayat,
            # Municipality, Corporation. Named for the column it comes from.
            "lb_type": r["lb_type"],
            "has_finances": r["years_with_finance"] > 0,
            "has_meetings": r["has_meetings"],
            "has_geometry": r["has_geometry"],
            "in_elections": r["in_elections"],
            "first_cycle": r["first_cycle"],
            "last_cycle": r["last_cycle"],
            # Which years, not how many. The year control reads these and
            # offers nothing else.
            "finance_years": finance_years.get(r["lb_key"], []),
            "meeting_years": meeting_years.get(r["lb_key"], []),
            "years_with_finance": len(finance_years.get(r["lb_key"], [])),
            "years_with_meetings": len(meeting_years.get(r["lb_key"], [])),
        }
        for r in rows
    ]

    districts = sorted({b["district_name"] for b in bodies})

    return public_json(
        request,
        {
            "bodies": bodies,
            "count": len(bodies),
            "districts": districts,
            # The year control's options travel with the selector, so no page
            # hardcodes the fourteen years or which of them is still open.
            "financial_years": [
                {"year_label": y["year_label"], "is_complete": y["is_complete"]}
                for y in years
            ],
            "cycles": [2010, 2015, 2020, 2025],
            "provenance": provenance("bodies"),
        },
    )
