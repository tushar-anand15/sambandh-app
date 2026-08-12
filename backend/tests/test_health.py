"""Proves the harness runs end to end, before any product endpoint exists.

Three things have to be true for every later unit's tests to mean anything:
the app boots under the test client, ``get_pool()`` hands out the test pool
rather than the developer's database, and the fixture slice actually contains
the rows the assertions claim. Each is asserted here against a figure taken
from the real master database, so deleting a row from ``master_slice.sql``
turns this file red.
"""

import asyncpg
import pytest


# ---------------------------------------------------------------------------
# The app boots and its routers are wired
# ---------------------------------------------------------------------------


async def test_app_serves_its_schema(client):
    """The ASGI app answers. If this fails, nothing else in the suite can run."""
    response = await client.get("/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "GramSAMBANDH API"


async def test_authenticated_route_refuses_without_a_token(client):
    """An existing endpoint answers 401, not 500.

    A 500 here would mean the app is falling over before auth — a broken pool,
    a missing import — and would mask that in every later test.
    """
    response = await client.get("/api/documents/filters")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# The pool override reaches application code
# ---------------------------------------------------------------------------


async def test_get_pool_returns_the_test_pool(test_pool):
    """``app.database.get_pool()`` — what every router calls — is the test pool."""
    from app.database import get_pool

    assert await get_pool() is test_pool


async def test_pool_points_at_the_test_database(test_pool):
    """And that pool is not the developer's or production database."""
    async with test_pool.acquire() as conn:
        assert await conn.fetchval("SELECT current_database()") == "sambandh_test"


# ---------------------------------------------------------------------------
# The fixture slice loaded, and holds real figures
# ---------------------------------------------------------------------------


async def test_slice_holds_the_seven_chosen_bodies(db):
    codes = [
        r["lb_code"]
        for r in await db.fetch("SELECT lb_code FROM core.local_body ORDER BY lb_code")
    ]

    assert codes == ["B03024", "D12001", "G04036", "G13064", "M07025", "M08032", "M13057"]


async def test_chalakudy_2023_24_matches_the_real_database(db, chalakudy):
    """The worked example, unrounded: 357 projects, ₹23.88 cr and ₹11.69 cr.

    These are the master database's own figures. An assertion in a later unit
    that quotes them is therefore an assertion about real data, not about a
    number somebody typed into a fixture.
    """
    row = await db.fetchrow(
        """
        SELECT s.projects, s.formulation, s.expense
        FROM finance.lb_year_summary s
        JOIN core.local_body lb USING (lb_key)
        WHERE lb.lb_code = $1 AND s.year_label = '2023-2024'
        """,
        chalakudy,
    )

    assert row is not None, "Chalakudy 2023-2024 is missing from the fixture slice"
    assert row["projects"] == 357
    assert row["formulation"] == 238806688
    assert row["expense"] == 116913203


async def test_mattannur_has_finance_and_meetings_but_no_election(db, mattannur):
    """The awkward body: the SEC published no result, everything else is there."""
    body = await db.fetchrow(
        "SELECT in_elections, first_cycle, last_cycle FROM core.local_body WHERE lb_code = $1",
        mattannur,
    )
    coverage = await db.fetchrow(
        "SELECT has_meetings, years_with_finance FROM core.lb_coverage "
        "WHERE lb_key = (SELECT lb_key FROM core.local_body WHERE lb_code = $1)",
        mattannur,
    )
    candidates = await db.fetchval(
        "SELECT count(*) FROM elections.candidate "
        "WHERE lb_key = (SELECT lb_key FROM core.local_body WHERE lb_code = $1)",
        mattannur,
    )

    assert body["in_elections"] is False
    assert body["first_cycle"] is None and body["last_cycle"] is None
    assert coverage["has_meetings"] is True
    assert coverage["years_with_finance"] == 14
    assert candidates == 0


async def test_slice_covers_a_body_with_no_geometry(db):
    """205 of 1,238 bodies have none; the map has to say so rather than omit them."""
    row = await db.fetchrow(
        "SELECT has_geometry FROM core.lb_coverage WHERE lb_key = "
        "(SELECT lb_key FROM core.local_body WHERE lb_code = 'B03024')"
    )

    assert row["has_geometry"] is False


async def test_slice_covers_a_body_whose_cycles_end_in_2010(db):
    """Null-ish cycle handling: a body that existed for one cycle and stopped."""
    row = await db.fetchrow(
        "SELECT first_cycle, last_cycle FROM core.local_body WHERE lb_code = 'G13064'"
    )
    cycles = await db.fetch(
        "SELECT DISTINCT cycle FROM elections.ward WHERE lb_key = "
        "(SELECT lb_key FROM core.local_body WHERE lb_code = 'G13064') ORDER BY 1"
    )

    assert (row["first_cycle"], row["last_cycle"]) == (2010, 2010)
    assert [r["cycle"] for r in cycles] == [2010]


async def test_meeting_coverage_starts_at_different_years(db):
    """Late-starting and early-starting bodies sit in the same slice.

    Without both, a page cannot be tested for the difference between "the portal
    holds no record for that year" and "the body held no meetings".
    """
    rows = await db.fetch(
        """
        SELECT lb.lb_code, min(m.year_label) AS first_year
        FROM meetings.lb_year_summary m
        JOIN core.local_body lb USING (lb_key)
        GROUP BY 1 ORDER BY 1
        """
    )
    first_year = {r["lb_code"]: r["first_year"] for r in rows}

    assert first_year["G04036"] == "2015-2016"
    assert first_year["M07025"] == "2023-2024"


async def test_slice_covers_a_district_panchayat(db):
    types = {
        r["lb_type"]
        for r in await db.fetch("SELECT DISTINCT lb_type FROM core.local_body")
    }

    assert "District Panchayat" in types


async def test_every_year_row_joins_to_a_body(db):
    """The slice is internally complete — no orphan rows in any rollup."""
    orphans = await db.fetchval(
        """
        SELECT
          (SELECT count(*) FROM finance.lb_year_summary  s WHERE NOT EXISTS
             (SELECT 1 FROM core.local_body lb WHERE lb.lb_key = s.lb_key))
        + (SELECT count(*) FROM meetings.lb_year_summary s WHERE NOT EXISTS
             (SELECT 1 FROM core.local_body lb WHERE lb.lb_key = s.lb_key))
        + (SELECT count(*) FROM finance.project        p WHERE NOT EXISTS
             (SELECT 1 FROM core.local_body lb WHERE lb.lb_key = p.lb_key))
        + (SELECT count(*) FROM meetings.meeting       m WHERE NOT EXISTS
             (SELECT 1 FROM core.local_body lb WHERE lb.lb_key = m.lb_key))
        """
    )

    assert orphans == 0


async def test_the_incomplete_financial_year_is_flagged(db):
    """2025-2026 is in progress; every closed year is not."""
    incomplete = [
        r["year_label"]
        for r in await db.fetch(
            "SELECT year_label FROM core.financial_year WHERE NOT is_complete"
        )
    ]

    assert incomplete == ["2025-2026"]


async def test_a_table_outside_the_slice_fails_loudly(db):
    """Absent tables must raise, not return nothing.

    ``meetings.artifact`` is real in the master database and deliberately left
    out here. A query against it should be a missing-relation error a developer
    can act on, never an empty result that reads as "no attachments".
    """
    with pytest.raises(asyncpg.UndefinedTableError):
        await db.fetch("SELECT * FROM meetings.artifact LIMIT 1")
