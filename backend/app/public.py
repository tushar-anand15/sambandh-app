"""Shared machinery for the public, unauthenticated read API.

Everything in this module exists because the same three things are true of
every public endpoint:

1. **It is cacheable.** The master database is rebuilt wholesale, not mutated,
   so a body-year answer is stable between builds. Responses carry a
   ``Cache-Control`` and a strong ``ETag``, and a repeat request with a matching
   ``If-None-Match`` gets a 304 with no body.
2. **It carries its provenance.** Every payload names the dataset it came from
   and the date that dataset was built, so no page ever hardcodes a source line
   (R9).
3. **It never answers a missing section with a bare ``[]``.** Three cases the UI
   renders differently have to stay distinguishable:

   | Case | Status | Payload |
   |---|---|---|
   | The body does not exist | 404 | ``detail`` naming the code |
   | The body exists, the section does not cover it | 200 | ``available: false`` + ``reason_code: "not_covered"`` |
   | The section covers it, but that year is empty | 200 | ``available: false`` + a year-specific ``reason_code`` |

   Collapsing the last two produces pages that read as broken — a body that
   genuinely holds no Sakarma record looks identical to one whose record simply
   starts later.

The field names here are the contract ``frontend/src/test/handlers.ts`` mirrors.
Changing one changes both.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from collections import deque
from typing import Any

from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------

# The master database is built by ``sulekha`` (see its ``docs/master_db_runbook.md``).
# It is a wholesale rebuild, so one date describes the whole thing.
DATASET = "Gram Sambandh master database"
BUILD_DATE = os.environ.get("MASTER_BUILD_DATE", "2026-08-13")

# The upstream portal each section is derived from. Named per section because
# "where did this number come from" is answered by the portal, not by the
# warehouse the portal was loaded into.
SOURCES: dict[str, str] = {
    "bodies": "Kerala LSGD registry, reconciled across Sulekha, Sakarma and the State Election Commission",
    "finances": "Sulekha plan monitoring portal",
    "meetings": "Sakarma meeting manifest",
    "elections": "Kerala State Election Commission",
    "maps": "KSMART vector tiles and the opendatakerala OpenStreetMap release",
}


def provenance(section: str) -> dict[str, str]:
    """The provenance block every public payload carries."""
    return {"dataset": DATASET, "build_date": BUILD_DATE, "source": SOURCES[section]}


# ---------------------------------------------------------------------------
# The three empty cases
# ---------------------------------------------------------------------------

# Machine-readable reasons. The prose in ``reason`` is what a page shows; the
# code is what a page branches on, so rewording never breaks a test or a UI.
NOT_COVERED = "not_covered"
NO_RECORD_FOR_YEAR = "no_record_for_year"
NO_RESULT_PUBLISHED = "no_result_published"
NO_RESULT_FOR_CYCLE = "no_result_for_cycle"


def unavailable(
    section: str, reason_code: str, reason: str, **extra: Any
) -> dict[str, Any]:
    """A section with nothing to show, and a stated cause. Never a bare list."""
    return {
        "available": False,
        "reason_code": reason_code,
        "reason": reason,
        **extra,
        "provenance": provenance(section),
    }


def body_not_found(lb_code: str) -> HTTPException:
    """404 naming the code, so a bad deep link says which code was bad."""
    return HTTPException(status_code=404, detail=f"No local body with code {lb_code}")


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------

# A day in the browser, a week in any shared cache willing to revalidate. The
# data behind these endpoints changes only when the master database is rebuilt.
CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800"


def _etag(payload: bytes) -> str:
    return '"' + hashlib.sha256(payload).hexdigest()[:32] + '"'


def _matches(if_none_match: str | None, etag: str) -> bool:
    if not if_none_match:
        return False
    if if_none_match.strip() == "*":
        return True
    candidates = {c.strip().removeprefix("W/") for c in if_none_match.split(",")}
    return etag in candidates


def public_json(request: Request, payload: Any) -> Response:
    """Serialise ``payload`` with cache headers and a strong ETag.

    Returns 304 with no body when the client already holds this exact bytes.
    The ETag is over the serialised payload, so it changes if and only if the
    answer does — including across a database rebuild.
    """
    body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
    etag = _etag(body)
    headers = {"ETag": etag, "Cache-Control": CACHE_CONTROL, "Vary": "Accept-Encoding"}

    if _matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)

    return Response(
        content=body, media_type="application/json", headers=headers, status_code=200
    )


def public_csv(request: Request, text: str, filename: str) -> Response:
    """A CSV download with the same caching contract as the JSON it mirrors."""
    body = text.encode("utf-8")
    etag = _etag(body)
    headers = {
        "ETag": etag,
        "Cache-Control": CACHE_CONTROL,
        "Content-Disposition": f'attachment; filename="{filename}"',
    }

    if _matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)

    return Response(content=body, media_type="text/csv; charset=utf-8", headers=headers)


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

# The data is meant to be public, so the goal is availability under scraping,
# not restriction. The limit is generous and per-IP; it exists so one client
# cannot exhaust a small VM's connections, not to ration access.
RATE_LIMIT = int(os.environ.get("PUBLIC_RATE_LIMIT_PER_MINUTE", "600"))
RATE_WINDOW = 60.0

_hits: dict[str, deque[float]] = {}


def check_rate(client: str, now: float | None = None, limit: int | None = None) -> bool:
    """Sliding-window counter. True when the request is within the limit.

    In-process and unshared: with one app process this is exact, and with
    several it is per-process, which is the right failure direction — the
    effective limit rises rather than rejecting traffic that should pass.
    """
    limit = RATE_LIMIT if limit is None else limit
    if limit <= 0:  # 0 disables the limiter entirely.
        return True

    now = time.monotonic() if now is None else now
    window = _hits.setdefault(client, deque())
    while window and now - window[0] > RATE_WINDOW:
        window.popleft()
    if len(window) >= limit:
        return False
    window.append(now)
    return True


def rate_limit(request: Request) -> None:
    """Router dependency. 429 with a ``Retry-After`` once the window is full."""
    client = request.client.host if request.client else "unknown"
    if not check_rate(client):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. This data is public and free to download in bulk — see /api/maps for the layer files.",
            headers={"Retry-After": "60"},
        )


def reset_rate_limits() -> None:
    """Drop all counters. For tests, and for a process that has been idle."""
    _hits.clear()


# ---------------------------------------------------------------------------
# Shared queries
# ---------------------------------------------------------------------------

# The selector spine. ``core.lb_coverage`` holds the flags but not
# ``in_elections``, which lives on ``core.local_body`` — hence the join.
BODY_SQL = """
    SELECT lb.lb_key,
           lb.lb_code,
           lb.lb_name_en,
           lb.lb_name_ml,
           lb.district_name,
           lb.lb_type,
           lb.first_cycle,
           lb.last_cycle,
           lb.in_elections,
           coalesce(c.has_meetings, false)  AS has_meetings,
           coalesce(c.has_geometry, false)  AS has_geometry,
           coalesce(c.years_with_finance, 0) AS years_with_finance,
           coalesce(c.years_with_meetings, 0) AS years_with_meetings
    FROM core.local_body lb
    LEFT JOIN core.lb_coverage c USING (lb_key)
"""


async def fetch_body(conn, lb_code: str):
    """One body, or a 404 naming the code the caller asked for."""
    row = await conn.fetchrow(BODY_SQL + " WHERE lb.lb_code = $1", lb_code)
    if row is None:
        raise body_not_found(lb_code)
    return row


def body_block(row) -> dict[str, Any]:
    """The body identity every section payload repeats, so a page needs one call."""
    return {
        "lb_code": row["lb_code"],
        "lb_name_en": row["lb_name_en"],
        "lb_name_ml": row["lb_name_ml"],
        "district_name": row["district_name"],
        "lb_type": row["lb_type"],
    }


VALID_CYCLES = (2010, 2015, 2020, 2025)

# A financial year label as the master database writes it: ``2023-2024``.
# Used as a path pattern so a malformed year is a 422 from FastAPI's own
# validation rather than a 500 from a query that was never going to match.
YEAR_PATTERN = r"^\d{4}-\d{4}$"


async def fetch_year(conn, year_label: str):
    """A financial year row, or 422 — a well-formed year outside the dataset.

    ``2019-2020`` and ``1066-1067`` are both syntactically years; only one of
    them is a year this dataset covers, and a caller asking for the other has
    sent an unprocessable path value, not found nothing.
    """
    row = await conn.fetchrow(
        "SELECT year_label, start_date, end_date, is_complete "
        "FROM core.financial_year WHERE year_label = $1",
        year_label,
    )
    if row is None:
        first, last = await _year_bounds(conn)
        raise HTTPException(
            status_code=422,
            detail=(
                f"{year_label} is not a financial year in this dataset. "
                f"Years run from {first} to {last}."
            ),
        )
    return row


async def _year_bounds(conn) -> tuple[str, str]:
    row = await conn.fetchrow(
        "SELECT min(year_label) AS first, max(year_label) AS last FROM core.financial_year"
    )
    return row["first"], row["last"]


def year_block(row) -> dict[str, Any]:
    """The year identity, carrying whether it is closed.

    2025-2026 is in progress. It must never be compared silently against a
    closed year, so ``is_complete`` travels with every figure that quotes it.
    """
    return {"year_label": row["year_label"], "is_complete": row["is_complete"]}


def as_int(value: Any) -> int | None:
    """Elections columns arrive as text from the SEC's own exports."""
    if value is None or value == "":
        return None
    try:
        return int(str(value).strip())
    except ValueError:
        return None


def as_number(value: Any) -> Any:
    """Money and counts, unrounded.

    ``Decimal`` serialises through ``json.dumps(default=str)`` as a quoted
    string, which would make every rupee figure a string in the payload. Whole
    amounts become ints and fractional ones floats, so the JSON carries numbers
    and the CSV carries the same digits.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    try:
        as_float = float(value)
    except (TypeError, ValueError):
        return value
    return int(as_float) if as_float == int(as_float) else as_float
