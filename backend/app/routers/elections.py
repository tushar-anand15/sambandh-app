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

``/statewide/{cycle}`` is the fourth case and a different question: not one
body but all of them, summed per cycle for the block that appears on both the
home page and the elections page.

Every column in ``elections.*`` is text, as the SEC's own exports publish it.
Counts on the per-body payloads are cast here rather than in the database so an
unparseable value surfaces as null rather than failing the whole build. The
statewide aggregate casts in SQL instead, because counting a hundred thousand
ward rows in Python to answer one question would be the wrong place to do the
arithmetic; the cast there is written so that an unparseable cell is one null
and not a failed query.
"""

import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from pydantic import BaseModel

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

    That holds at every level below it too, and the map has three of them. A
    voter in rural Kerala casts three ballots — a grama panchayat ward, a block
    panchayat ward, a district panchayat ward — to three bodies elected
    separately over the same ground. So a block panchayat's front in `bodies`
    is that block panchayat's own result and never a summary of the grama
    panchayats inside it, exactly as a district's is never a summary of the
    bodies inside it. The map draws one tier at a time for the same reason:
    stacking two would invite the reading that the upper one aggregates the
    lower, and nothing about the picture would look wrong enough to correct it.

    Which grama panchayats sit inside a given block panchayat is not in this
    payload, because it is not in the database: `core.local_body` carries a
    body's district and its type and no parent. It is derived from the
    published geometry at `/geo/block-membership.json`, and carried per body by
    `/api/bodies`.

    Bodies that contested in 2010 and had no successor are in `bodies` like any
    other, with their result, and appear in no boundary layer at any level.
    Their `last_cycle` is 2010, which is what a caller reads to say they could
    not be placed rather than dropping them.

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


# ---------------------------------------------------------------------------
# Statewide aggregate
# ---------------------------------------------------------------------------

# The fronts, in the order the site draws them. Fixed here rather than read
# from the data so a cycle with no rows still returns four fronts.
FRONTS = ("LDF", "UDF", "NDA", "OTH")

# The SEC publishes one of three control types, or nothing. "unstated" carries
# the fourth case rather than dropping those bodies out of the denominator.
CONTROL_TYPES = ("majority", "hung", "tie", "unstated")

# Reservation as the SEC spells it. Anything else, including a blank, is
# counted as "Unstated" so the categories always sum to the ward count.
RESERVATIONS = ("General", "Woman", "SC", "SC Woman", "ST", "ST Woman", "Unstated")

# Margin bands in absolute votes, since a ward's electorate is not published
# and a share of valid votes would be a different question. ``unknown`` holds
# wards where either vote count is missing or unparseable — an uncontested
# ward has no runner-up.
MARGIN_BANDS: tuple[tuple[str, str, int | None, int | None], ...] = (
    ("under_50", "Under 50 votes", None, 49),
    ("50_99", "50 to 99", 50, 99),
    ("100_249", "100 to 249", 100, 249),
    ("250_499", "250 to 499", 250, 499),
    ("500_999", "500 to 999", 500, 999),
    ("1000_plus", "1,000 or more", 1000, None),
    ("unknown", "Margin not published", None, None),
)

# Every column in ``elections.*`` is text. ``regexp_replace`` strips anything
# that is not a digit and ``nullif`` turns what is left of an unparseable value
# into null, so one bad cell is one null rather than a failed query.
_INT = "nullif(regexp_replace({col}, '\\D', '', 'g'), '')::int"

STATEWIDE_SEATS_SQL = f"""
    SELECT count(*)::int                                   AS bodies,
           sum({_INT.format(col='lb_seats_ldf')})::int      AS ldf,
           sum({_INT.format(col='lb_seats_udf')})::int      AS udf,
           sum({_INT.format(col='lb_seats_nda')})::int      AS nda,
           sum({_INT.format(col='lb_seats_oth')})::int      AS oth,
           count(*) FILTER (WHERE lower(btrim(coalesce(lb_control_type, ''))) = 'majority')::int AS majority,
           count(*) FILTER (WHERE lower(btrim(coalesce(lb_control_type, ''))) = 'hung')::int     AS hung,
           count(*) FILTER (WHERE lower(btrim(coalesce(lb_control_type, ''))) = 'tie')::int      AS tie,
           count(*) FILTER (WHERE lower(btrim(coalesce(lb_control_type, '')))
                                  NOT IN ('majority', 'hung', 'tie'))::int                       AS unstated
    FROM elections.body_result
    WHERE cycle = $1
"""

STATEWIDE_WARDS_SQL = f"""
    WITH w AS (
        SELECT {_INT.format(col='winner_votes')} - {_INT.format(col='runnerup_votes')} AS margin,
               btrim(coalesce(reservation, '')) AS reservation
        FROM elections.ward
        WHERE cycle = $1
    )
    SELECT count(*)::int AS wards,
           count(*) FILTER (WHERE margin < 50)::int                        AS "under_50",
           count(*) FILTER (WHERE margin BETWEEN 50 AND 99)::int           AS "50_99",
           count(*) FILTER (WHERE margin BETWEEN 100 AND 249)::int         AS "100_249",
           count(*) FILTER (WHERE margin BETWEEN 250 AND 499)::int         AS "250_499",
           count(*) FILTER (WHERE margin BETWEEN 500 AND 999)::int         AS "500_999",
           count(*) FILTER (WHERE margin >= 1000)::int                     AS "1000_plus",
           count(*) FILTER (WHERE margin IS NULL)::int                     AS "unknown",
           count(*) FILTER (WHERE reservation = 'General')::int            AS "General",
           count(*) FILTER (WHERE reservation = 'Woman')::int              AS "Woman",
           count(*) FILTER (WHERE reservation = 'SC')::int                 AS "SC",
           count(*) FILTER (WHERE reservation = 'SC Woman')::int           AS "SC Woman",
           count(*) FILTER (WHERE reservation = 'ST')::int                 AS "ST",
           count(*) FILTER (WHERE reservation = 'ST Woman')::int           AS "ST Woman",
           count(*) FILTER (WHERE reservation
                            NOT IN ('General', 'Woman', 'SC', 'SC Woman', 'ST', 'ST Woman'))::int AS "Unstated"
    FROM w
"""

NO_STATEWIDE_RESULT = (
    "The State Election Commission has published no result for any local body "
    "in this cycle."
)


class FrontSeats(BaseModel):
    """One front's ward seats, summed across every body that contested."""

    front: str
    seats: int | None
    #: Share of all ward seats in the cycle, 0.0–1.0. ``None`` when no body has
    #: a published result, because a share of no seats is not zero — it is
    #: unknown, and drawing it as 0% would be a claim about an election the
    #: Commission has not reported.
    share: float | None


class MarginBand(BaseModel):
    """Wards whose winning margin fell in one band of votes."""

    key: str
    label: str
    min_votes: int | None
    max_votes: int | None
    wards: int | None
    share: float | None


class ControlCount(BaseModel):
    """Councils by how they are controlled, not by which front controls them."""

    control_type: str
    bodies: int | None
    share: float | None


class ReservationCount(BaseModel):
    """Ward seats by the reservation the seat was notified under."""

    reservation: str
    wards: int | None
    share: float | None


class StatewideElections(BaseModel):
    cycle: int
    available: bool
    reason_code: str | None
    reason: str | None
    #: The denominators, stated rather than left to be inferred from the parts.
    bodies_with_result: int
    wards_counted: int
    seats: list[FrontSeats]
    seats_total: int | None
    margins: list[MarginBand]
    control: list[ControlCount]
    reservation: list[ReservationCount]
    provenance: dict[str, str]


# A few minutes. The block this backs sits on two pages, Elections being the
# busier of them, and every visit to either would otherwise re-run two
# full-table aggregates for the same four possible answers.
#
# The TTL is the whole point of the cache being safe. A cycle is a stable key,
# so without one a warm entry would never be displaced short of a restart — and
# the backend runs `restart: unless-stopped`, so it outlives a data reload into
# the same volume. A stale entry does not only serve a stale figure: it pins a
# stale *strong* ETag behind a 24-hour `Cache-Control` on every client that saw
# it, which no rebuild would dislodge.
#
# This is a per-process dictionary and is therefore wrong the moment there are
# two workers: each would hold its own copy and expire it on its own clock, so
# two clients could hold different strong ETags for the same URL. It exists at
# all because nginx in front of this does no `proxy_cache` — there is nowhere
# else for a shared cached copy to live.
#
# Concurrent cold requests for the same cycle each run the aggregate. At four
# cycles over a database this size that is a duplicated query, not a stampede,
# so there is deliberately no single-flight lock to go wrong.
STATEWIDE_CACHE_TTL = 300.0
_statewide_cache: dict[int, tuple[float, dict[str, Any]]] = {}


def reset_statewide_cache() -> None:
    """Drop every cached cycle. For tests, and for a reload in the same process."""
    _statewide_cache.clear()


def _share(part: int | None, whole: int | None) -> float | None:
    """A share, or ``None`` where there is no denominator to divide by."""
    if part is None or not whole:
        return None
    return part / whole


async def statewide_payload(conn, cycle: int) -> dict[str, Any]:
    """The aggregate for one cycle, uncached."""
    seats_row = await conn.fetchrow(STATEWIDE_SEATS_SQL, cycle)
    ward_row = await conn.fetchrow(STATEWIDE_WARDS_SQL, cycle)

    bodies = seats_row["bodies"]
    wards = ward_row["wards"]
    available = bool(bodies or wards)

    seat_counts = {front: seats_row[front.lower()] if bodies else None for front in FRONTS}
    seats_total = sum(v for v in seat_counts.values() if v is not None) if bodies else None

    payload = StatewideElections(
        cycle=cycle,
        available=available,
        reason_code=None if available else NO_RESULT_FOR_CYCLE,
        reason=None if available else NO_STATEWIDE_RESULT,
        bodies_with_result=bodies,
        wards_counted=wards,
        seats=[
            FrontSeats(
                front=front,
                seats=seat_counts[front],
                share=_share(seat_counts[front], seats_total),
            )
            for front in FRONTS
        ],
        seats_total=seats_total,
        margins=[
            MarginBand(
                key=key,
                label=label,
                min_votes=low,
                max_votes=high,
                wards=ward_row[key] if wards else None,
                share=_share(ward_row[key], wards) if wards else None,
            )
            for key, label, low, high in MARGIN_BANDS
        ],
        control=[
            ControlCount(
                control_type=control,
                bodies=seats_row[control] if bodies else None,
                share=_share(seats_row[control], bodies) if bodies else None,
            )
            for control in CONTROL_TYPES
        ],
        reservation=[
            ReservationCount(
                reservation=reservation,
                wards=ward_row[reservation] if wards else None,
                share=_share(ward_row[reservation], wards) if wards else None,
            )
            for reservation in RESERVATIONS
        ],
        provenance=provenance("elections"),
    )
    return payload.model_dump()


@router.get("/statewide/{cycle}", response_model=StatewideElections)
async def statewide(request: Request, cycle: int):
    """Kerala's whole local-body result for one cycle, in four distributions.

    Declared above ``/{lb_code}/{cycle}`` so the path resolves here rather than
    to a body whose code is "statewide".

    **What is being summed.** A ward seat is a ward seat in exactly one body,
    and Kerala elects five kinds of body on the same day: grama panchayats,
    municipalities and corporations, which divide the ground between them, and
    block panchayats and district panchayats, which are elected over the same
    ground again. 941 grama panchayats + 86 municipalities + 6 corporations are
    1,033 first-tier bodies; the 152 blocks and 14 districts bring the bodies
    that contest to 1,199. (``core.local_body`` holds 1,238, the extra 39 being
    bodies that no longer contest.) A rural voter therefore casts three ballots
    and is represented by three winners, so ``seats_total`` counts seats and not
    voters, and it is roughly a third larger than the number of wards a map of
    Kerala would show.

    That is the same warning ``/fronts/{cycle}`` carries about colour: a block
    panchayat's result is its own and never a rollup of the grama panchayats
    inside it. Here the tiers are added rather than nested, which is legitimate
    for a question about seats won — every seat in the sum is a distinct seat —
    and wrong for any question about territory or population. A front's share of
    ward seats is not its share of Kerala, and this endpoint carries no figure
    that claims to be.

    **The denominators**, each stated in the payload rather than inferred:

    * ``seats`` is over ``seats_total``, the sum of the four front columns on
      every ``body_result`` row for the cycle. It is the seats the Commission
      reported, so a body whose row is missing is absent from both halves of the
      fraction rather than counted as zero.
    * ``margins`` and ``reservation`` are over ``wards_counted``, the ward rows
      for the cycle. Both partition it exactly: every ward falls in one margin
      band, ``unknown`` included, and under one reservation, ``Unstated``
      included.
    * ``control`` is over ``bodies_with_result``.

    A cycle with no rows at all returns this whole shape with nulls in place of
    every figure and ``available: false``, so a page can say the record is
    absent instead of drawing a chart of zeroes (R20).
    """
    if cycle not in VALID_CYCLES:
        raise HTTPException(
            status_code=422,
            detail=f"{cycle} is not a local-body election cycle. "
            f"Cycles are {', '.join(str(c) for c in VALID_CYCLES)}.",
        )

    cached = _statewide_cache.get(cycle)
    if cached is not None and time.monotonic() - cached[0] < STATEWIDE_CACHE_TTL:
        return public_json(request, cached[1])

    pool = await get_pool()
    async with pool.acquire() as conn:
        payload = await statewide_payload(conn, cycle)
    _statewide_cache[cycle] = (time.monotonic(), payload)

    return public_json(request, payload)


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
