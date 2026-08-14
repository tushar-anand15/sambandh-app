"""The properties every public endpoint shares, tested once across all of them.

Three claims:

* they answer with no ``Authorization`` header, and ``/api/chat`` still does not;
* they are cacheable, and a repeat request with a matching ``If-None-Match``
  costs a 304 with no body;
* every payload carries the dataset it came from and the date it was built, so
  no page ever hardcodes a source line.

The CSV downloads are here too, because the guarantee that matters about them —
that they hold exactly the rows the JSON endpoint returned, unrounded — is a
property of the pair, not of either one.
"""

import csv
import io

import pytest

from app import public

PUBLIC_ENDPOINTS = [
    "/api/bodies",
    "/api/maps",
    "/api/finances/M08032",
    "/api/finances/M08032/2023-2024",
    "/api/meetings/M08032/2023-2024",
    "/api/elections/M08032/2020",
    "/api/download/finances/M08032/2023-2024.csv",
    "/api/download/meetings/M08032/2023-2024.csv",
    "/api/download/elections/M08032/2020.csv",
]


# ---------------------------------------------------------------------------
# Unauthenticated
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("path", PUBLIC_ENDPOINTS)
async def test_answers_without_a_token(client, path):
    response = await client.get(path)

    assert response.status_code == 200


async def test_the_assistant_still_refuses_without_a_token(client):
    """Un-gating the data must not un-gate the one endpoint that costs money."""
    response = await client.post("/api/chat", json={"message": "hello"})

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("path", PUBLIC_ENDPOINTS)
async def test_carries_cache_headers_and_an_etag(client, path):
    response = await client.get(path)

    assert response.headers["cache-control"] == public.CACHE_CONTROL
    assert response.headers["etag"].startswith('"')


@pytest.mark.parametrize("path", PUBLIC_ENDPOINTS)
async def test_a_repeat_request_with_if_none_match_is_304(client, path):
    first = await client.get(path)

    second = await client.get(path, headers={"If-None-Match": first.headers["etag"]})

    assert second.status_code == 304
    assert second.content == b""
    assert second.headers["etag"] == first.headers["etag"]


async def test_a_stale_etag_gets_the_body_again(client):
    response = await client.get("/api/bodies", headers={"If-None-Match": '"not-the-etag"'})

    assert response.status_code == 200
    assert response.json()["count"] == 7


async def test_different_answers_have_different_etags(client):
    one = await client.get("/api/finances/M08032/2023-2024")
    two = await client.get("/api/finances/M08032/2022-2023")

    assert one.headers["etag"] != two.headers["etag"]


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("path", [p for p in PUBLIC_ENDPOINTS if not p.endswith(".csv")])
async def test_every_payload_names_its_dataset_and_build_date(client, path):
    payload = (await client.get(path)).json()

    assert payload["provenance"]["dataset"] == public.DATASET
    assert payload["provenance"]["build_date"] == public.BUILD_DATE
    assert payload["provenance"]["source"]


async def test_an_unavailable_payload_carries_provenance_too(client, mattannur):
    """The source line renders on an empty state as much as on a populated one."""
    payload = (await client.get(f"/api/elections/{mattannur}/2020")).json()

    assert payload["available"] is False
    assert payload["provenance"]["build_date"] == public.BUILD_DATE


async def test_sections_name_their_own_upstream_portal(client, chalakudy):
    finances = (await client.get(f"/api/finances/{chalakudy}/2023-2024")).json()
    meetings = (await client.get(f"/api/meetings/{chalakudy}/2023-2024")).json()

    assert finances["provenance"]["source"] != meetings["provenance"]["source"]
    assert "Sulekha" in finances["provenance"]["source"]
    assert "Sakarma" in meetings["provenance"]["source"]


# ---------------------------------------------------------------------------
# CSV downloads
# ---------------------------------------------------------------------------


def _rows(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


async def test_the_finance_csv_holds_exactly_the_json_rows(client, chalakudy):
    payload = (await client.get(f"/api/finances/{chalakudy}/2023-2024")).json()
    response = await client.get(f"/api/download/finances/{chalakudy}/2023-2024.csv")

    rows = _rows(response.text)
    assert len(rows) == len(payload["project_rows"]) == 357
    assert [r["project_no"] for r in rows] == [p["project_no"] for p in payload["project_rows"]]


async def test_the_finance_csv_is_unrounded(client, chalakudy):
    payload = (await client.get(f"/api/finances/{chalakudy}/2023-2024")).json()
    response = await client.get(f"/api/download/finances/{chalakudy}/2023-2024.csv")

    rows = _rows(response.text)
    assert [r["formulation"] for r in rows] == [
        str(p["formulation"]) for p in payload["project_rows"]
    ]
    assert sum(float(r["formulation"]) for r in rows) == payload["formulation"]


async def test_the_meetings_csv_holds_exactly_the_json_rows(client, chalakudy):
    payload = (await client.get(f"/api/meetings/{chalakudy}/2023-2024")).json()
    response = await client.get(f"/api/download/meetings/{chalakudy}/2023-2024.csv")

    rows = _rows(response.text)
    assert len(rows) == len(payload["meeting_rows"]) == 64
    assert [r["meeting_date"] for r in rows] == [m["meeting_date"] for m in payload["meeting_rows"]]


async def test_the_elections_csv_holds_exactly_the_ward_rows(client, chalakudy):
    payload = (await client.get(f"/api/elections/{chalakudy}/2020")).json()
    response = await client.get(f"/api/download/elections/{chalakudy}/2020.csv")

    rows = _rows(response.text)
    assert len(rows) == len(payload["wards"]) == 36
    assert [r["winner_name"] for r in rows] == [w["winner_name"] for w in payload["wards"]]


async def test_a_download_is_served_as_an_attachment(client, chalakudy):
    response = await client.get(f"/api/download/finances/{chalakudy}/2023-2024.csv")

    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    assert f"finances_{chalakudy}_2023-2024.csv" in response.headers["content-disposition"]


async def test_a_download_of_an_unavailable_section_states_the_reason(client, mattannur):
    """Never a zero-byte file. The reason is the JSON endpoint's own wording."""
    json_payload = (await client.get(f"/api/elections/{mattannur}/2020")).json()
    response = await client.get(f"/api/download/elections/{mattannur}/2020.csv")

    assert response.status_code == 404
    assert response.json()["detail"] == json_payload["reason"]


async def test_an_unknown_download_section_is_422(client, chalakudy):
    response = await client.get(f"/api/download/sectors/{chalakudy}/2023-2024.csv")

    assert response.status_code == 422


async def test_an_unknown_body_download_is_404_naming_the_code(client):
    response = await client.get("/api/download/finances/Z99999/2023-2024.csv")

    assert response.status_code == 404
    assert "Z99999" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


def test_the_limiter_admits_traffic_up_to_its_window():
    public.reset_rate_limits()

    admitted = [public.check_rate("1.2.3.4", now=100.0, limit=3) for _ in range(5)]

    assert admitted == [True, True, True, False, False]


def test_the_limiter_forgets_a_client_after_the_window():
    public.reset_rate_limits()
    for _ in range(3):
        public.check_rate("1.2.3.4", now=100.0, limit=3)

    assert public.check_rate("1.2.3.4", now=100.0, limit=3) is False
    assert public.check_rate("1.2.3.4", now=161.0, limit=3) is True


def test_one_client_cannot_exhaust_another():
    public.reset_rate_limits()
    for _ in range(3):
        public.check_rate("1.2.3.4", now=100.0, limit=3)

    assert public.check_rate("5.6.7.8", now=100.0, limit=3) is True


def test_a_zero_limit_disables_the_limiter():
    """Because a public dataset should fail open, not closed."""
    public.reset_rate_limits()

    assert all(public.check_rate("1.2.3.4", now=100.0, limit=0) for _ in range(1000))
