"""The method endpoint: what changed by year, and what the build was made from.

``app/routers/method.py`` is deliberately not registered in ``main.py`` — router
wiring is done in one place — so this module includes it on the application
itself before exercising it. That is the only difference between what these
tests hit and what a deployment serves.
"""

from __future__ import annotations

import pytest

from app.routers.maps import LAYERS


@pytest.fixture(scope="module", autouse=True)
def wire_method_router():
    from app.main import app
    from app.routers.method import router

    if not any(getattr(r, "path", "").startswith("/api/method") for r in app.routes):
        app.include_router(router)


@pytest.fixture(scope="module")
async def payload(client):
    response = await client.get("/api/method")
    assert response.status_code == 200
    return response.json()


async def test_bodies_by_year_covers_all_fourteen_years(payload, db):
    series = payload["bodies_by_year"]
    years = [row["year_label"] for row in series]

    expected = [
        r["year_label"]
        for r in await db.fetch("SELECT year_label FROM core.financial_year ORDER BY 1")
    ]
    assert len(expected) == 14
    assert years == expected


async def test_bodies_per_year_matches_the_table_it_is_read_from(payload, db):
    counts = {row["year_label"]: row["bodies"] for row in payload["bodies_by_year"]}

    rows = await db.fetch(
        "SELECT year_label, count(*) AS bodies FROM core.lb_sulekha_year GROUP BY 1"
    )
    for row in rows:
        assert counts[row["year_label"]] == row["bodies"], row["year_label"]


async def test_the_first_year_has_no_entries_or_departures(payload):
    first, second = payload["bodies_by_year"][0], payload["bodies_by_year"][1]

    # Null, not zero: there is no earlier list for 2012-2013 to differ from, and
    # a zero would read as a year in which nothing changed.
    assert first["entered"] is None
    assert first["left"] is None
    assert isinstance(second["entered"], int)
    assert isinstance(second["left"], int)


async def test_entries_and_departures_reconcile_with_the_body_count(payload):
    series = payload["bodies_by_year"]
    for previous, current in zip(series, series[1:]):
        assert (
            current["bodies"]
            == previous["bodies"] + current["entered"] - current["left"]
        ), current["year_label"]


async def test_the_body_diff_states_what_the_source_does_not_record(payload):
    note = payload["body_diff_note"]
    assert "merged" in note and "reclassified" in note


async def test_dataset_coverage_carries_both_datasets_for_every_year(payload, db):
    coverage = {row["year_label"]: row for row in payload["dataset_coverage"]}
    assert len(coverage) == 14

    row = await db.fetchrow(
        """
        SELECT count(*) AS bodies, sum(projects) AS projects, sum(formulation) AS formulation
        FROM finance.lb_year_summary WHERE year_label = '2023-2024'
        """
    )
    entry = coverage["2023-2024"]
    assert entry["finance_bodies"] == row["bodies"]
    assert entry["projects"] == row["projects"]
    assert entry["formulation"] == float(row["formulation"])


async def test_a_year_before_the_meeting_record_starts_reports_zero_not_null(payload):
    # 2012-2013 predates every Sakarma record in the slice. The row still exists
    # with zeros, so the page can show the record starting rather than showing a
    # gap that looks like a failed query.
    entry = next(
        row for row in payload["dataset_coverage"] if row["year_label"] == "2012-2013"
    )
    assert entry["meeting_bodies"] == 0
    assert entry["meetings"] == 0


async def test_the_open_year_is_flagged(payload):
    flags = {row["year_label"]: row["is_complete"] for row in payload["dataset_coverage"]}
    assert flags["2025-2026"] is False
    assert flags["2024-2025"] is True


async def test_boundary_vintage_has_one_entry_per_cycle_newest_first(payload):
    cycles = [entry["cycle"] for entry in payload["boundary_vintage"]]
    assert cycles == [2025, 2020, 2015, 2010]
    assert {entry["cycle"] for entry in payload["boundary_vintage"]} == {
        layer["cycle"] for layer in LAYERS
    }


async def test_only_2025_has_ward_geometry_and_the_reuse_is_stated(payload):
    by_cycle = {entry["cycle"]: entry for entry in payload["boundary_vintage"]}

    assert by_cycle[2025]["level"] == "ward"
    assert by_cycle[2020]["level"] == "local_body"

    # The 2015 and 2010 layers are the November 2020 snapshot reused. The page
    # must not be able to render them as contemporaneous.
    for cycle in (2015, 2010):
        assert by_cycle[cycle]["per_cycle_delimitation"] is False
        assert "November 2020" in by_cycle[cycle]["boundary_vintage"] + (
            by_cycle[cycle]["note"] or ""
        )

    assert "Ward boundaries exist for 2025 only" in payload["ward_geometry_note"]


async def test_the_build_block_names_the_dumps_it_was_built_from(payload, db):
    manifest = await db.fetchrow("SELECT * FROM core.build_manifest LIMIT 1")
    build = payload["build"]

    assert build["dataset"] == manifest["dataset"]
    assert build["master_version"] == manifest["master_version"]
    assert build["source_dumps"] == list(manifest["source_dumps"])
    assert build["bodies"] == manifest["bodies"]
    assert build["built_at"].startswith(str(manifest["built_at"].year))


async def test_the_endpoint_answers_without_a_token(client):
    # Everything but the assistant is public. A method page behind a login would
    # be the site arguing against its own premise.
    response = await client.get("/api/method")
    assert response.status_code == 200
    assert "ETag" in response.headers
