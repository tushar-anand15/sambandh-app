"""`/api/bodies` — the selector list every data section is driven from.

This is the one payload the whole frontend reads before anything else, so its
shape is worth pinning: a body missing a district or a tier makes the district
dropdown unbuildable, and a missing coverage flag makes the site offer a
section that will answer "nothing here".
"""


async def test_lists_every_body_in_the_slice(client):
    payload = (await client.get("/api/bodies")).json()

    codes = sorted(b["lb_code"] for b in payload["bodies"])
    assert codes == ["B03024", "D12001", "G04036", "G13064", "M07025", "M08032", "M13057"]
    assert payload["count"] == 7


async def test_every_body_carries_a_district_and_a_tier(client):
    payload = (await client.get("/api/bodies")).json()

    for body in payload["bodies"]:
        assert body["district_name"], f"{body['lb_code']} has no district"
        assert body["lb_type"], f"{body['lb_code']} has no tier"

    tiers = {b["lb_type"] for b in payload["bodies"]}
    assert {"Municipality", "Grama Panchayat", "Block Panchayat", "District Panchayat"} <= tiers


async def test_names_are_carried_in_both_scripts(client):
    payload = (await client.get("/api/bodies")).json()
    by_code = {b["lb_code"]: b for b in payload["bodies"]}

    assert by_code["M08032"]["lb_name_en"] == "Chalakudy"
    assert by_code["M08032"]["lb_name_ml"] == "ചാലക്കുടി"
    # Not every body has a Malayalam name in the source. Null, not an empty
    # string, so a page can tell "absent" from "blank".
    assert by_code["G13064"]["lb_name_ml"] is None


async def test_coverage_flags_match_the_fixture(client):
    payload = (await client.get("/api/bodies")).json()
    by_code = {b["lb_code"]: b for b in payload["bodies"]}

    # Mattannur: finance and meetings, but the SEC published no result.
    assert by_code["M13057"]["has_meetings"] is True
    assert by_code["M13057"]["in_elections"] is False

    # Pulikkeezhu is one of the 205 bodies with no geometry.
    assert by_code["B03024"]["has_geometry"] is False

    # Panoor's meetings are absent entirely — the selector must be able to say
    # so before a visitor clicks through to an empty page.
    assert by_code["G13064"]["has_meetings"] is False
    assert by_code["G13064"]["in_elections"] is True


async def test_year_and_cycle_options_travel_with_the_selector(client):
    payload = (await client.get("/api/bodies")).json()

    years = payload["financial_years"]
    assert [y["year_label"] for y in years][0] == "2012-2013"
    assert len(years) == 14
    assert [y["year_label"] for y in years if not y["is_complete"]] == ["2025-2026"]
    assert payload["cycles"] == [2010, 2015, 2020, 2025]


async def test_districts_are_listed_for_the_first_dropdown(client):
    payload = (await client.get("/api/bodies")).json()

    assert "THRISSUR" in payload["districts"]
    assert payload["districts"] == sorted(payload["districts"])


async def test_carries_its_provenance(client):
    payload = (await client.get("/api/bodies")).json()

    assert payload["provenance"]["dataset"]
    assert payload["provenance"]["build_date"]


# ---------------------------------------------------------------------------
# Which years, not how many
# ---------------------------------------------------------------------------


async def test_each_body_names_the_years_it_has_a_record_for(client):
    """The year control is built from these lists, so a body that has nothing
    for 2015-16 must not be offered 2015-16."""
    payload = (await client.get("/api/bodies")).json()
    by_code = {b["lb_code"]: b for b in payload["bodies"]}

    # Aluva's meeting record starts in 2023-24; Muttar's in 2015-16.
    assert by_code["M07025"]["meeting_years"][0] == "2023-2024"
    assert by_code["G04036"]["meeting_years"][0] == "2015-2016"
    assert "2016-2017" not in by_code["M07025"]["meeting_years"]

    # Panoor has no Sakarma record at all, so it has no meeting years.
    assert by_code["G13064"]["meeting_years"] == []
    assert by_code["G13064"]["has_meetings"] is False


async def test_the_year_lists_are_sorted_and_hold_real_financial_years(client):
    payload = (await client.get("/api/bodies")).json()
    known = {y["year_label"] for y in payload["financial_years"]}

    for body in payload["bodies"]:
        for field in ("meeting_years", "finance_years"):
            years = body[field]
            assert years == sorted(years), f"{body['lb_code']} {field} is unsorted"
            assert set(years) <= known, f"{body['lb_code']} {field} has an unknown year"


async def test_the_counts_are_the_lengths_of_the_lists(client):
    """Both are published, so a page reading either reads the same fact."""
    payload = (await client.get("/api/bodies")).json()

    for body in payload["bodies"]:
        assert body["years_with_meetings"] == len(body["meeting_years"])
        assert body["years_with_finance"] == len(body["finance_years"])
