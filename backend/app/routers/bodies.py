"""The selector list — every local body, with what each section holds for it.

One request, cached hard, read once by the frontend and reused by all three
data sections. The per-section flags are the point: a visitor should never be
offered a Meetings view for a body Sakarma has no record of, and the reason
that view is missing should be stateable without a second round trip.
"""

from fastapi import APIRouter, Depends, Request

from ..database import get_pool
from ..public import BODY_SQL, provenance, public_json, rate_limit

router = APIRouter(prefix="/api/bodies", tags=["public"], dependencies=[Depends(rate_limit)])


@router.get("")
async def list_bodies(request: Request):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(BODY_SQL + " ORDER BY lb.district_ord, lb.lb_name_en")
        years = await conn.fetch(
            "SELECT year_label, is_complete FROM core.financial_year ORDER BY year_label"
        )

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
            "years_with_finance": r["years_with_finance"],
            "years_with_meetings": r["years_with_meetings"],
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
