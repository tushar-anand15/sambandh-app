"""`/api/elections/statewide/{cycle}` — one cycle, summed across every body.

The block this backs appears on two pages, so the figures behind it are
computed once in Postgres rather than assembled in the browser from a request
per body. The claims that matter here:

* the totals reconcile against the per-body endpoint, so the aggregate is a sum
  of the same rows a reader can open one at a time and check;
* `statewide` resolves as a route and not as a local body code, which it would
  if the declaration slipped below `/{lb_code}/{cycle}`;
* a cycle with no rows returns the full shape with nulls, so the page can state
  that the record is absent rather than drawing a chart of zeroes;
* the in-process cache expires, so a rebuilt database shows through without a
  restart of a container that is `restart: unless-stopped`.
"""

import pytest

from app.routers import elections

STATEWIDE = "/api/elections/statewide"


@pytest.fixture(autouse=True)
def cold_cache():
    """The cache is process-global, so no test may inherit another's entry."""
    elections.reset_statewide_cache()
    yield
    elections.reset_statewide_cache()


# ---------------------------------------------------------------------------
# Route resolution
# ---------------------------------------------------------------------------


async def test_statewide_is_a_route_and_not_a_body_code(client):
    """Declared above `/{lb_code}/{cycle}`. Below it, this 404s on a body code."""
    response = await client.get(f"{STATEWIDE}/2020")

    assert response.status_code == 200
    payload = response.json()
    assert payload["cycle"] == 2020
    assert "lb_code" not in payload


async def test_the_route_carries_the_rate_limiter(client):
    from app.main import app
    from app.public import rate_limit

    route = next(
        r for r in app.routes if getattr(r, "path", None) == f"{STATEWIDE}/{{cycle}}"
    )

    assert any(d.call is rate_limit for d in route.dependant.dependencies)


async def test_a_year_that_is_not_a_cycle_is_refused(client):
    response = await client.get(f"{STATEWIDE}/2019")

    assert response.status_code == 422
    assert "2010, 2015, 2020, 2025" in response.json()["detail"]


# ---------------------------------------------------------------------------
# The figures
# ---------------------------------------------------------------------------


async def test_the_seat_totals_match_the_per_body_endpoint(client):
    """The aggregate is a sum of the rows the per-body endpoint serves.

    Written after `test_the_front_matches_the_per_body_endpoint`, and for the
    same reason: an aggregate nobody can reconcile against the underlying rows
    is a number the site is asserting on its own authority.
    """
    codes = [b["lb_code"] for b in (await client.get("/api/bodies")).json()["bodies"]]
    expected = {"LDF": 0, "UDF": 0, "NDA": 0, "OTH": 0}
    for code in codes:
        body = (await client.get(f"/api/elections/{code}/2020")).json()
        for front, seats in (body.get("seats") or {}).items():
            expected[front] += seats or 0

    payload = (await client.get(f"{STATEWIDE}/2020")).json()

    assert {s["front"]: s["seats"] for s in payload["seats"]} == expected
    assert payload["seats_total"] == sum(expected.values())


async def test_2020_carries_seats_margins_control_and_reservation(client):
    payload = (await client.get(f"{STATEWIDE}/2020")).json()

    assert payload["available"] is True
    assert payload["bodies_with_result"] == 5
    assert payload["wards_counted"] == 104
    assert {s["front"]: s["seats"] for s in payload["seats"]} == {
        "LDF": 21,
        "UDF": 57,
        "NDA": 7,
        "OTH": 19,
    }
    assert payload["seats_total"] == 104
    assert {c["control_type"]: c["bodies"] for c in payload["control"]} == {
        "majority": 2,
        "hung": 2,
        "tie": 1,
        "unstated": 0,
    }
    assert {r["reservation"]: r["wards"] for r in payload["reservation"]} == {
        "General": 45,
        "Woman": 51,
        "SC": 4,
        "SC Woman": 1,
        "ST": 2,
        "ST Woman": 0,
        "Unstated": 1,
    }


async def test_the_margin_bands_cover_every_ward_exactly_once(client):
    payload = (await client.get(f"{STATEWIDE}/2020")).json()

    bands = {b["key"]: b["wards"] for b in payload["margins"]}
    assert bands == {
        "under_50": 25,
        "50_99": 16,
        "100_249": 31,
        "250_499": 13,
        "500_999": 8,
        "1000_plus": 11,
        "unknown": 0,
    }
    assert sum(bands.values()) == payload["wards_counted"] == 104


async def test_every_share_is_a_fraction_of_a_stated_denominator(client):
    payload = (await client.get(f"{STATEWIDE}/2020")).json()

    assert sum(s["share"] for s in payload["seats"]) == pytest.approx(1.0)
    assert sum(b["share"] for b in payload["margins"]) == pytest.approx(1.0)
    assert sum(r["share"] for r in payload["reservation"]) == pytest.approx(1.0)
    assert sum(c["share"] for c in payload["control"]) == pytest.approx(1.0)


async def test_the_payload_names_its_dataset(client):
    payload = (await client.get(f"{STATEWIDE}/2020")).json()

    assert "Election Commission" in payload["provenance"]["source"]


# ---------------------------------------------------------------------------
# A cycle with no rows (R20)
# ---------------------------------------------------------------------------


@pytest.fixture
async def cycle_2010_erased(db):
    """Every 2010 row put aside and restored, so the empty case is reachable.

    The fixture slice holds ward rows for all four cycles. Statewide, a cycle
    with no rows at all is what the site would serve between a cycle being
    called and the SEC publishing it, and that is the state R20 is about.
    """
    await db.execute("CREATE TABLE elections._ward_2010 AS SELECT * FROM elections.ward WHERE cycle = 2010")
    await db.execute(
        "CREATE TABLE elections._result_2010 AS "
        "SELECT * FROM elections.body_result WHERE cycle = 2010"
    )
    await db.execute("DELETE FROM elections.ward WHERE cycle = 2010")
    await db.execute("DELETE FROM elections.body_result WHERE cycle = 2010")
    try:
        yield
    finally:
        await db.execute("INSERT INTO elections.ward SELECT * FROM elections._ward_2010")
        await db.execute("INSERT INTO elections.body_result SELECT * FROM elections._result_2010")
        await db.execute("DROP TABLE elections._ward_2010, elections._result_2010")


async def test_a_cycle_with_no_rows_returns_the_full_shape_with_nulls(
    client, cycle_2010_erased
):
    """Not a partial object: the page states the record is absent (R20)."""
    response = await client.get(f"{STATEWIDE}/2010")

    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is False
    assert payload["reason_code"] == "no_result_for_cycle"
    assert payload["reason"]
    assert payload["seats_total"] is None
    assert [s["front"] for s in payload["seats"]] == ["LDF", "UDF", "NDA", "OTH"]
    assert all(s["seats"] is None and s["share"] is None for s in payload["seats"])
    assert len(payload["margins"]) == 7
    assert all(b["wards"] is None and b["share"] is None for b in payload["margins"])
    assert len(payload["control"]) == 4
    assert all(c["bodies"] is None and c["share"] is None for c in payload["control"])
    assert len(payload["reservation"]) == 7
    assert all(r["wards"] is None and r["share"] is None for r in payload["reservation"])
    assert payload["provenance"]["source"]


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------


async def test_a_repeat_request_with_if_none_match_is_304(client):
    first = await client.get(f"{STATEWIDE}/2020")

    second = await client.get(
        f"{STATEWIDE}/2020", headers={"If-None-Match": first.headers["etag"]}
    )

    assert second.status_code == 304
    assert second.content == b""


async def test_a_cached_entry_expires_so_new_data_shows_without_a_restart(
    client, db, monkeypatch, chalakudy
):
    """The container is `restart: unless-stopped` and outlives a data reload."""

    def ldf(payload):
        return next(s["seats"] for s in payload["seats"] if s["front"] == "LDF")

    before = ldf((await client.get(f"{STATEWIDE}/2015")).json())
    await db.execute(
        "UPDATE elections.body_result SET lb_seats_ldf = (lb_seats_ldf::int + 1)::text "
        "WHERE cycle = 2015 AND lb_code = $1",
        chalakudy,
    )
    try:
        assert ldf((await client.get(f"{STATEWIDE}/2015")).json()) == before

        monkeypatch.setattr(elections, "STATEWIDE_CACHE_TTL", 0.0)

        assert ldf((await client.get(f"{STATEWIDE}/2015")).json()) == before + 1
    finally:
        await db.execute(
            "UPDATE elections.body_result SET lb_seats_ldf = (lb_seats_ldf::int - 1)::text "
            "WHERE cycle = 2015 AND lb_code = $1",
            chalakudy,
        )
