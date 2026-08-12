"""`/api/elections/{lb_code}/{cycle}`.

Mattannur is the reason this file exists in the shape it does. The State
Election Commission published no result for it — it is on the spine from the
SEC's own registry, with ``in_elections = false`` and null cycles. The endpoint
has to say that in words. A 404 would tell a visitor the body does not exist,
and an empty chart would tell them it won nothing; both are false.
"""

import pytest


async def test_chalakudy_2020_front_totals(client, chalakudy):
    response = await client.get(f"/api/elections/{chalakudy}/2020")
    payload = response.json()

    assert response.status_code == 200
    assert payload["available"] is True
    assert payload["total_wards"] == 36
    assert payload["seats"] == {"LDF": 1, "UDF": 25, "NDA": 0, "OTH": 10}
    assert payload["ruling_front"] == "UDF"
    assert payload["control_type"] == "majority"


async def test_seats_add_up_to_the_ward_count(client, chalakudy):
    payload = (await client.get(f"/api/elections/{chalakudy}/2020")).json()

    assert sum(payload["seats"].values()) == payload["total_wards"]
    assert len(payload["wards"]) == payload["total_wards"]


async def test_a_hung_body_states_its_control_type(client, chalakudy):
    """2015 left no front in control. ``ruling_front`` is null and says why."""
    payload = (await client.get(f"/api/elections/{chalakudy}/2015")).json()

    assert payload["ruling_front"] is None
    assert payload["control_type"] == "hung"
    assert payload["largest_front"] == "LDF"


async def test_ward_rows_carry_winner_runner_up_and_margin(client, chalakudy):
    payload = (await client.get(f"/api/elections/{chalakudy}/2020")).json()

    ward = next(w for w in payload["wards"] if w["runnerup_votes"] is not None)
    assert ward["winner_name"]
    assert ward["winner_votes"] > ward["runnerup_votes"]
    assert ward["margin"] == ward["winner_votes"] - ward["runnerup_votes"]
    assert 0 < ward["margin_pct"] <= 100
    assert ward["reservation"] is not None


async def test_candidates_are_returned_for_the_cycle(client, chalakudy):
    payload = (await client.get(f"/api/elections/{chalakudy}/2020")).json()

    assert len(payload["candidates"]) > len(payload["wards"])
    assert {c["ward_no"] for c in payload["candidates"]} == {w["ward_no"] for w in payload["wards"]}
    winners = [c for c in payload["candidates"] if c["status"] == "won"]
    assert len(winners) == payload["total_wards"]


# ---------------------------------------------------------------------------
# Mattannur — no result published, and it is not a 404 or an empty chart
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("cycle", [2010, 2015, 2020, 2025])
async def test_mattannur_returns_no_result_published(client, mattannur, cycle):
    response = await client.get(f"/api/elections/{mattannur}/{cycle}")
    payload = response.json()

    assert response.status_code == 200
    assert payload["available"] is False
    assert payload["reason_code"] == "no_result_published"
    assert payload["in_elections"] is False
    assert "State Election Commission" in payload["reason"]


async def test_mattannur_returns_no_chartable_arrays(client, mattannur):
    """Not a bare `[]` anywhere — a chart given empty arrays draws zero seats."""
    payload = (await client.get(f"/api/elections/{mattannur}/2020")).json()

    assert payload.get("wards") is None
    assert payload.get("seats") is None
    assert payload["provenance"]["build_date"]


async def test_mattannur_is_normal_in_the_other_sections(client, mattannur):
    """The exception is scoped to elections and does not leak."""
    finances = (await client.get(f"/api/finances/{mattannur}/2023-2024")).json()
    meetings = (await client.get(f"/api/meetings/{mattannur}/2023-2024")).json()

    assert finances["available"] is True
    assert meetings["available"] is True


# ---------------------------------------------------------------------------
# Cycles a body has no result for
# ---------------------------------------------------------------------------


async def test_a_body_whose_results_stop_after_2010(client):
    """Panoor was constituted for 2010 and no cycle after it."""
    response = await client.get("/api/elections/G13064/2025")
    payload = response.json()

    assert response.status_code == 200
    assert payload["available"] is False
    assert payload["reason_code"] == "no_result_for_cycle"
    assert "2010" in payload["reason"]
    # And distinct from Mattannur's case, which is about the whole body.
    assert payload["in_elections"] is True


async def test_its_own_cycle_still_answers(client):
    payload = (await client.get("/api/elections/G13064/2010")).json()

    assert payload["available"] is True
    assert payload["total_wards"] == 13


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


async def test_unknown_body_is_a_404_naming_the_code(client):
    response = await client.get("/api/elections/Z99999/2020")

    assert response.status_code == 404
    assert "Z99999" in response.json()["detail"]


@pytest.mark.parametrize("cycle", ["banana", "2019", "0", "20201"])
async def test_a_cycle_that_is_not_an_election_year_is_422(client, chalakudy, cycle):
    response = await client.get(f"/api/elections/{chalakudy}/{cycle}")

    assert response.status_code == 422
