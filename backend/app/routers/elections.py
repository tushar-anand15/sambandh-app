"""Elections — one body, one cycle: wards, candidates and front totals.

The three cases this endpoint keeps apart:

* the body does not exist — 404;
* the body exists but the State Election Commission published no result for it
  at all (``in_elections = false``, 30 bodies statewide, Mattannur among them)
  — 200 with ``no_result_published``, so the page states the cause instead of
  drawing an empty chart;
* the body has results, but not for the cycle asked for — 200 with
  ``no_result_for_cycle``, naming the cycles it does have, so a body first
  constituted in 2015 reads as not yet constituted in 2010 rather than as
  having won zero seats.

Every column in ``elections.*`` is text, as the SEC's own exports publish it.
Counts are cast here rather than in the database so an unparseable value
surfaces as null rather than failing the whole build.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Request

from ..database import get_pool
from ..public import (
    NO_RESULT_FOR_CYCLE,
    NO_RESULT_PUBLISHED,
    VALID_CYCLES,
    as_int,
    body_block,
    fetch_body,
    provenance,
    public_json,
    rate_limit,
    unavailable,
)

router = APIRouter(prefix="/api/elections", tags=["public"], dependencies=[Depends(rate_limit)])

NO_RESULT_REASON = (
    "The State Election Commission published no result for this local body in "
    "any of the four elections."
)


def _cycle_reason(cycle: int, first: int | None, last: int | None) -> str:
    if first and last and cycle < first:
        return f"This local body did not exist at the {cycle} election. Its results begin in {first}."
    if first and last and cycle > last:
        return f"This local body has no result after {last}."
    return f"The State Election Commission published no result for this local body in {cycle}."


def _ward_row(r) -> dict[str, Any]:
    winner = as_int(r["winner_votes"])
    runnerup = as_int(r["runnerup_votes"])
    valid = as_int(r["valid_votes"])
    margin = winner - runnerup if winner is not None and runnerup is not None else None
    return {
        "ward_no": as_int(r["ward_no"]),
        "ward_code": r["ward_code"],
        "ward_name": r["ward_name"],
        "ward_name_ml": r["ward_name_mal"],
        "reservation": r["reservation"],
        "winner_name": r["winner_name"],
        "winner_party": r["winner_party"],
        "winner_front": r["winner_party_group"],
        "winner_votes": winner,
        "winner_role": r["winner_role"],
        "winner_gender": r["winner_gender"],
        "runnerup_name": r["runnerup_name"],
        "runnerup_votes": runnerup,
        "margin": margin,
        # A share of valid votes, not of the electorate — the SEC publishes no
        # turnout figure per ward.
        "margin_pct": round(100 * margin / valid, 2) if margin is not None and valid else None,
        "valid_votes": valid,
        "invalid_votes": as_int(r["invalid_votes"]),
        "candidates": as_int(r["n_candidates"]),
        "uncontested": r["uncontested"] == "Y",
        "tie": r["tie"] == "Y",
    }


def _candidate_row(r) -> dict[str, Any]:
    return {
        "ward_no": as_int(r["ward_no"]),
        "ward_name": r["ward_name"],
        "candidate_name": r["candidate_name"],
        "candidate_name_en": r["candidate_name_eng"],
        "party": r["party_name"],
        "front": r["party_front"] or r["party_group"],
        "votes": as_int(r["total_votes"]),
        "status": r["status"],
        "gender": r["candidate_gender"],
        "age": as_int(r["candidate_age"]),
        "role": r["candidate_role"],
    }


async def cycle_payload(conn, body, cycle: int) -> dict[str, Any]:
    """One body-cycle, shared by the JSON endpoint and the CSV download."""
    base = {
        "lb_code": body["lb_code"],
        "cycle": cycle,
        "body": body_block(body),
        "in_elections": body["in_elections"],
        "first_cycle": body["first_cycle"],
        "last_cycle": body["last_cycle"],
    }

    if not body["in_elections"]:
        return unavailable("elections", NO_RESULT_PUBLISHED, NO_RESULT_REASON, **base)

    result = await conn.fetchrow(
        "SELECT * FROM elections.body_result WHERE lb_key = $1 AND cycle = $2",
        body["lb_key"],
        cycle,
    )
    wards = await conn.fetch(
        "SELECT * FROM elections.ward WHERE lb_key = $1 AND cycle = $2 "
        "ORDER BY (ward_no ~ '^[0-9]+$') DESC, nullif(regexp_replace(ward_no, '\\D', '', 'g'), '')::int, ward_no",
        body["lb_key"],
        cycle,
    )

    if result is None and not wards:
        return unavailable(
            "elections",
            NO_RESULT_FOR_CYCLE,
            _cycle_reason(cycle, body["first_cycle"], body["last_cycle"]),
            **base,
        )

    candidates = await conn.fetch(
        "SELECT * FROM elections.candidate WHERE lb_key = $1 AND cycle = $2 "
        "ORDER BY nullif(regexp_replace(ward_no, '\\D', '', 'g'), '')::int, candidate_code",
        body["lb_key"],
        cycle,
    )

    seats: dict[str, int | None] = {}
    summary: dict[str, Any] = {}
    if result is not None:
        seats = {
            "LDF": as_int(result["lb_seats_ldf"]),
            "UDF": as_int(result["lb_seats_udf"]),
            "NDA": as_int(result["lb_seats_nda"]),
            "OTH": as_int(result["lb_seats_oth"]),
        }
        summary = {
            "total_wards": as_int(result["total_wards"]),
            "majority_threshold": as_int(result["lb_majority_threshold"]),
            "largest_front": result["lb_largest_front"],
            "largest_front_seats": as_int(result["lb_largest_front_seats"]),
            # Null where no front took control outright; ``control_type`` says
            # "hung" rather than leaving the reader to infer it from a blank.
            "ruling_front": result["lb_ruling_front"],
            "control_type": result["lb_control_type"],
            "head": {
                "role": result["lb_head_role"],
                "name": result["lb_head_name"],
                "party": result["lb_head_party"],
                "front": result["lb_head_party_group"],
                "cross_front": result["lb_head_cross_front"] == "Y",
            },
        }

    return {
        **base,
        "available": True,
        "reason_code": None,
        "seats": seats,
        **summary,
        "wards": [_ward_row(w) for w in wards],
        "candidates": [_candidate_row(c) for c in candidates],
        "provenance": provenance("elections"),
    }


FRONTS_SQL = """
    SELECT lb.lb_code,
           lb.district_name,
           lb.lb_type,
           nullif(r.lb_ruling_front, '') AS ruling_front,
           nullif(r.lb_control_type, '') AS control_type,
           r.total_wards
    FROM core.local_body lb
    LEFT JOIN elections.body_result r
           ON r.lb_key = lb.lb_key AND r.cycle = $1
    WHERE lb.in_elections
    ORDER BY lb.district_ord, lb.lb_name_en
"""


@router.get("/fronts/{cycle}")
async def fronts(request: Request, cycle: int):
    """Every body's ruling front for one cycle, for colouring the map.

    Declared above ``/{lb_code}/{cycle}`` so the path resolves here rather than
    to a body whose code is "fronts".

    The map needs one colour per territory and nothing else, so this returns
    the front and the control type and stops. Fetching the full cycle payload
    per body instead would be a request per body — 1,238 of them statewide, each
    carrying every ward and candidate row — to read one field from each.

    A district's colour is its **district panchayat's** ruling front, which is
    what `districts` carries. It is not an aggregate over the bodies inside the
    district: those are separate elections to separate bodies, and a district
    with a UDF district panchayat can hold a majority of LDF grama panchayats.

    A body with no row for this cycle has a null front. The reason is the
    body's own cycle range, which `/api/bodies` already carries, so it is not
    repeated here.
    """
    if cycle not in VALID_CYCLES:
        raise HTTPException(
            status_code=422,
            detail=f"{cycle} is not a local-body election cycle. "
            f"Cycles are {', '.join(str(c) for c in VALID_CYCLES)}.",
        )

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(FRONTS_SQL, cycle)

    bodies = [
        {
            "lb_code": r["lb_code"],
            "district_name": r["district_name"],
            "lb_type": r["lb_type"],
            "ruling_front": r["ruling_front"],
            "control_type": r["control_type"],
            "total_wards": as_int(r["total_wards"]),
        }
        for r in rows
    ]

    # District order follows district_ord, which the query preserves.
    districts: list[dict[str, Any]] = []
    seen: set[str] = set()
    for body in bodies:
        name = body["district_name"]
        if name not in seen:
            seen.add(name)
            districts.append({"district_name": name, "bodies": 0})
        entry = next(d for d in districts if d["district_name"] == name)
        entry["bodies"] += 1
        if body["lb_type"] == "District Panchayat":
            entry["lb_code"] = body["lb_code"]
            entry["ruling_front"] = body["ruling_front"]
            entry["control_type"] = body["control_type"]

    for entry in districts:
        entry.setdefault("lb_code", None)
        entry.setdefault("ruling_front", None)
        entry.setdefault("control_type", None)

    return public_json(
        request,
        {
            "cycle": cycle,
            "bodies": bodies,
            "districts": districts,
            "count": len(bodies),
            "provenance": provenance("elections"),
        },
    )


@router.get("/{lb_code}/{cycle}")
async def elections_cycle(
    request: Request,
    lb_code: str,
    cycle: int = Path(description="One of 2010, 2015, 2020, 2025"),
):
    if cycle not in VALID_CYCLES:
        raise HTTPException(
            status_code=422,
            detail=f"{cycle} is not a local-body election cycle. "
            f"Cycles are {', '.join(str(c) for c in VALID_CYCLES)}.",
        )

    pool = await get_pool()
    async with pool.acquire() as conn:
        body = await fetch_body(conn, lb_code)
        return public_json(request, await cycle_payload(conn, body, cycle))
