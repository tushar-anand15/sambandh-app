"""`/api/meetings/{lb_code}/{year}`.

Two splits have to survive the round trip: who met (governing body against
standing committee) and how the meeting was called (ordinary against special).
They are different questions about the same meeting, so 18 + 46 and 31 + 33 both
have to add to the same 64.

The other thing under test is the distinction the Meetings page is built on —
Sakarma's coverage grows year on year, so a body-year with no row is usually a
thin record rather than a council that never met, and the payload has to say
which.
"""

import pytest


async def test_chalakudy_2023_24_counts(client, chalakudy):
    response = await client.get(f"/api/meetings/{chalakudy}/2023-2024")
    payload = response.json()

    assert response.status_code == 200
    assert payload["available"] is True
    assert payload["meetings"] == 64


async def test_the_two_splits_each_account_for_every_meeting(client, chalakudy):
    payload = (await client.get(f"/api/meetings/{chalakudy}/2023-2024")).json()

    # By category: who met.
    assert payload["governing_body"] == 18
    assert payload["standing_committee"] == 46
    assert payload["governing_body"] + payload["standing_committee"] == payload["meetings"]

    # By nature: how it was called.
    assert payload["ordinary"] == 31
    assert payload["special"] == 33
    assert payload["ordinary"] + payload["special"] == payload["meetings"]


async def test_the_meeting_list_carries_date_type_nature_and_venue(client, chalakudy):
    payload = (await client.get(f"/api/meetings/{chalakudy}/2023-2024")).json()

    rows = payload["meeting_rows"]
    assert len(rows) == payload["meetings"] == 64
    assert [r["meeting_date"] for r in rows] == sorted(r["meeting_date"] for r in rows)

    first = rows[0]
    assert set(first) >= {"meeting_date", "meeting_no", "meeting_type", "meeting_nature", "venue"}
    assert first["meeting_type"]
    assert first["meeting_nature"]


async def test_first_and_last_meeting_bound_the_list(client, chalakudy):
    payload = (await client.get(f"/api/meetings/{chalakudy}/2023-2024")).json()

    assert payload["first_meeting"] == "2023-10-12"
    assert payload["last_meeting"] == "2024-03-27"
    assert payload["meeting_rows"][0]["meeting_date"] == payload["first_meeting"]
    assert payload["meeting_rows"][-1]["meeting_date"] == payload["last_meeting"]


async def test_the_scope_note_says_what_is_served_and_what_is_not(client, chalakudy):
    payload = (await client.get(f"/api/meetings/{chalakudy}/2023-2024")).json()

    assert "decision register and minutes" in payload["scope_note"]
    assert "420,561 of its 443,235 meetings" in payload["scope_note"]


async def test_mattannur_meetings_are_ordinary(client, mattannur):
    """Its elections are the exception; its meetings are not."""
    payload = (await client.get(f"/api/meetings/{mattannur}/2023-2024")).json()

    assert payload["available"] is True
    assert payload["meetings"] == 83
    assert payload["governing_body"] == 19
    assert payload["standing_committee"] == 64


# ---------------------------------------------------------------------------
# The three empty cases, kept apart
# ---------------------------------------------------------------------------


async def test_unknown_body_is_a_404_naming_the_code(client):
    response = await client.get("/api/meetings/Z99999/2023-2024")

    assert response.status_code == 404
    assert "Z99999" in response.json()["detail"]


async def test_a_body_sakarma_has_no_record_of_at_all(client):
    """Panoor: not covered. Distinct from a year with nothing in it."""
    response = await client.get("/api/meetings/G13064/2023-2024")
    payload = response.json()

    assert response.status_code == 200
    assert payload["available"] is False
    assert payload["reason_code"] == "not_covered"
    assert payload.get("meeting_rows") is None


async def test_a_covered_body_in_a_year_before_its_record_starts(client):
    """Aluva is covered, but Sakarma's record for it begins in 2023-24.

    The page must say the portal holds no record for 2016-17 — not that the
    council held no meetings, which would be a claim the data cannot support.
    """
    response = await client.get("/api/meetings/M07025/2016-2017")
    payload = response.json()

    assert response.status_code == 200
    assert payload["available"] is False
    assert payload["reason_code"] == "no_record_for_year"
    # One sentence. The year control no longer offers this combination, so the
    # long explanation this state used to carry has nothing left to do.
    assert payload["reason"] == "Sakarma publishes no meetings for 2016-2017."


async def test_the_two_empty_cases_are_distinguishable(client):
    """The whole point: same status code, same shape, different reason code."""
    not_covered = (await client.get("/api/meetings/G13064/2023-2024")).json()
    no_record = (await client.get("/api/meetings/M07025/2016-2017")).json()

    assert not_covered["available"] is no_record["available"] is False
    assert not_covered["reason_code"] != no_record["reason_code"]
    assert not_covered["reason"] != no_record["reason"]


async def test_an_early_year_is_thin_not_absent(client):
    """Muttar's record starts in 2015-16, the earliest year in the corpus."""
    payload = (await client.get("/api/meetings/G04036/2015-2016")).json()

    assert payload["available"] is True
    assert payload["meetings"] >= 1


@pytest.mark.parametrize("year", ["2023", "banana", "2023-24"])
async def test_a_malformed_year_is_422_not_500(client, chalakudy, year):
    response = await client.get(f"/api/meetings/{chalakudy}/{year}")

    assert response.status_code == 422


async def test_carries_its_provenance(client, chalakudy):
    payload = (await client.get(f"/api/meetings/{chalakudy}/2023-2024")).json()

    assert payload["provenance"]["dataset"]
    assert payload["provenance"]["build_date"]
