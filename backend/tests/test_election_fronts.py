"""`/api/elections/fronts/{cycle}` — one colour per territory, one request.

The map colours districts and local bodies by ruling front. Reading that field
from the per-body endpoint would be a request per body, each carrying every
ward and candidate row, to use one field from each.

The route sits above `/{lb_code}/{cycle}`, so the first assertion here is that
`fronts` resolves as a route and not as a local body code.
"""


async def test_fronts_is_a_route_and_not_a_body_code(client):
    response = await client.get("/api/elections/fronts/2020")

    assert response.status_code == 200
    assert response.json()["cycle"] == 2020


async def test_every_body_with_results_appears_once(client, db):
    payload = (await client.get("/api/elections/fronts/2020")).json()

    expected = await db.fetchval("SELECT count(*) FROM core.local_body WHERE in_elections")
    codes = [b["lb_code"] for b in payload["bodies"]]
    assert len(codes) == expected == payload["count"]
    assert len(set(codes)) == len(codes)


async def test_a_body_the_sec_published_nothing_for_is_absent(client, mattannur):
    payload = (await client.get("/api/elections/fronts/2020")).json()

    assert mattannur not in {b["lb_code"] for b in payload["bodies"]}


async def test_the_front_matches_the_per_body_endpoint(client, chalakudy):
    fronts = (await client.get("/api/elections/fronts/2020")).json()
    body = (await client.get(f"/api/elections/{chalakudy}/2020")).json()

    entry = next(b for b in fronts["bodies"] if b["lb_code"] == chalakudy)
    assert entry["ruling_front"] == body["ruling_front"] == "UDF"
    assert entry["control_type"] == body["control_type"]
    assert entry["total_wards"] == body["total_wards"]


async def test_a_hung_body_carries_a_null_front_and_says_hung(client, chalakudy):
    payload = (await client.get("/api/elections/fronts/2015")).json()

    entry = next(b for b in payload["bodies"] if b["lb_code"] == chalakudy)
    assert entry["ruling_front"] is None
    assert entry["control_type"] == "hung"


async def test_a_body_with_no_result_that_cycle_carries_a_null_front(client):
    """Panoor's results stop after 2010. It is still in the list, uncoloured."""
    payload = (await client.get("/api/elections/fronts/2025")).json()

    entry = next(b for b in payload["bodies"] if b["lb_code"] == "G13064")
    assert entry["ruling_front"] is None
    assert entry["total_wards"] is None


async def test_a_district_takes_its_district_panchayats_front(client):
    payload = (await client.get("/api/elections/fronts/2025")).json()

    wayanad = next(d for d in payload["districts"] if d["district_name"] == "WAYANAD")
    assert wayanad["lb_code"] == "D12001"
    assert wayanad["ruling_front"] == "UDF"
    assert wayanad["bodies"] >= 1


async def test_a_district_whose_panchayat_tied_carries_no_front(client):
    """Wayanad's district panchayat tied in 2020. The district is uncoloured
    and says why, rather than being coloured for the larger front."""
    payload = (await client.get("/api/elections/fronts/2020")).json()

    wayanad = next(d for d in payload["districts"] if d["district_name"] == "WAYANAD")
    assert wayanad["ruling_front"] is None
    assert wayanad["control_type"] == "tie"


async def test_a_district_with_no_district_panchayat_row_is_still_listed(client):
    """The fixture slice holds no district panchayat for Thrissur. The district
    is still in the list, with a null front, so the map draws it uncoloured
    rather than dropping the territory."""
    payload = (await client.get("/api/elections/fronts/2020")).json()

    thrissur = next(d for d in payload["districts"] if d["district_name"] == "THRISSUR")
    assert thrissur["lb_code"] is None
    assert thrissur["ruling_front"] is None


async def test_a_year_that_is_not_a_cycle_is_refused(client):
    response = await client.get("/api/elections/fronts/2021")

    assert response.status_code == 422
    assert "2010, 2015, 2020, 2025" in response.json()["detail"]
