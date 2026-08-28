"""`/geo/*`: the whole layers, and the slice one map level asks for.

The layer files are a deployment input, not repository content — 7.5 MB to
57 MB each, built by sulekha's `geo build`. So the two states worth testing for
a download are the mounted one and the unmounted one, and the second has to
state its cause: a zero-byte 200 would be saved by the browser and fail in a
GeoJSON parser far from the reason it failed.

The slicing endpoints are tested against a fixture layer small enough to write
here and shaped like the real one: `lb_code` and `lb_type` on every feature,
`district_name` on the local bodies, `ward_no` on the wards, and a `provenance`
foreign member the slice has to carry forward, because two of the real layers
are ODbL and the attribution travels with anything cut out of them.

Two properties matter beyond the shape of the answer. The 57 MB file is walked
once, not once per request — asserted by counting index builds, since a
regression there is invisible in the payload and fatal in production. And a
cycle with no geometry at that level answers 404 with the reason, so the page
can draw its fallback instead of an empty map.
"""

import json

import pytest

from app import geo_store
from app.config import settings

LAYER = "local_bodies_2020.geojson"

# Small enough to write in a fixture, shaped like the real thing: a
# FeatureCollection carrying `provenance` as a foreign member.
SAMPLE = {
    "type": "FeatureCollection",
    "provenance": {
        "boundary_vintage": "November 2020 (opendatakerala OSM snapshot)",
        "per_cycle_delimitation": False,
    },
    "features": [],
}


@pytest.fixture(autouse=True)
def clean_geo_cache():
    """No index or slice survives into the next test."""
    geo_store.reset_geo_cache()
    yield
    geo_store.reset_geo_cache()


@pytest.fixture
def mounted(tmp_path, monkeypatch):
    """A geo directory holding one layer."""
    (tmp_path / LAYER).write_text(json.dumps(SAMPLE))
    monkeypatch.setattr(settings, "geo_dir", str(tmp_path))
    return tmp_path


@pytest.fixture
def unmounted(monkeypatch):
    monkeypatch.setattr(settings, "geo_dir", "")


async def test_a_mounted_layer_downloads_and_parses(client, mounted):
    response = await client.get(f"/geo/{LAYER}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/geo+json")
    payload = json.loads(response.content)
    assert payload["type"] == "FeatureCollection"
    assert payload["provenance"]["boundary_vintage"]


async def test_an_unmounted_server_states_why_it_serves_nothing(client, unmounted):
    response = await client.get(f"/geo/{LAYER}")

    assert response.status_code == 404
    assert response.json()["detail"] == (
        "This server holds no boundary files, so none can be downloaded."
    )


async def test_a_layer_missing_from_the_mount_is_distinguished(client, mounted):
    """2010 is the layer the current build does not emit. It is not a 404 for
    an unknown name and not an empty file — it is a named layer the directory
    does not hold."""
    response = await client.get("/geo/local_bodies_2010.geojson")

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail == "This boundary file is not on this server."
    assert "GEO_DIR" not in detail


async def test_a_name_outside_the_inventory_is_refused(client, mounted):
    response = await client.get("/geo/wards_2019.geojson")

    assert response.status_code == 404
    assert "/api/maps" in response.json()["detail"]


async def test_a_traversal_attempt_resolves_to_nothing(client, mounted):
    response = await client.get("/geo/..%2F..%2Fetc%2Fpasswd")

    assert response.status_code == 404


async def test_the_inventory_reports_what_this_server_holds(client, mounted):
    payload = (await client.get("/api/maps")).json()

    layers = {layer["id"]: layer for layer in payload["layers"]}
    assert layers["local_bodies_2020"]["available"] is True
    assert layers["local_bodies_2020"]["bytes"] > 0
    assert layers["local_bodies_2020"]["unavailable_reason"] is None

    absent = layers["wards_2025"]
    assert absent["available"] is False
    assert absent["bytes"] is None
    assert absent["unavailable_reason"] == "This boundary file is not on this server."


async def test_the_inventory_names_seven_layers(client, unmounted):
    """Four KSMART 2025 layers and three opendatakerala local-body layers."""
    payload = (await client.get("/api/maps")).json()

    assert payload["count"] == 7
    assert len(payload["layers"]) == 7
    assert sum(1 for layer in payload["layers"] if layer["source"].startswith("KSMART")) == 4


# ---------------------------------------------------------------------------
# The fixture layers the slicing endpoints read
# ---------------------------------------------------------------------------


def square(x: float, y: float) -> list[list[list[float]]]:
    """A unit square as a Polygon ring, closed."""
    return [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]]


def feature(properties: dict, rings: list) -> dict:
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {"type": "Polygon", "coordinates": rings},
    }


# Two districts, two Grama Panchayats each, side by side. Each district's pair
# shares one edge, so a dissolve that works drops that edge and leaves a single
# rectangle. The Block Panchayat covers ALPHA a second time and must not be
# drawn: the real 2015 and 2020 layers carry 152 of them.
LOCAL_BODIES = {
    "type": "FeatureCollection",
    "provenance": {"licence": "© OpenStreetMap contributors, ODbL 1.0"},
    "features": [
        feature(
            {
                "lb_code": "G01001",
                "lb_name": "Alpha West",
                "lb_type": "Grama Panchayat",
                "district_name": "ALPHA",
            },
            square(0, 0),
        ),
        feature(
            {
                "lb_code": "G01002",
                "lb_name": "Alpha East",
                "lb_type": "Grama Panchayat",
                "district_name": "ALPHA",
            },
            square(1, 0),
        ),
        feature(
            {
                "lb_code": "B01001",
                "lb_name": "Alpha Block",
                "lb_type": "Block Panchayat",
                "district_name": "ALPHA",
            },
            [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]],
        ),
        feature(
            {
                "lb_code": "D01001",
                "lb_name": "Alpha District Panchayat",
                "lb_type": "District Panchayat",
                "district_name": "ALPHA",
            },
            [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]],
        ),
        feature(
            {
                "lb_code": "M02001",
                "lb_name": "Beta Town",
                "lb_type": "Municipality",
                "district_name": "BETA",
            },
            square(2, 0),
        ),
        feature(
            {
                "lb_code": "C02001",
                "lb_name": "Beta City",
                "lb_type": "Corporation",
                "district_name": "BETA",
            },
            square(3, 0),
        ),
    ],
}

WARDS = {
    "type": "FeatureCollection",
    "provenance": {"licence": "KSMART wardmap, no open licence published"},
    "features": [
        feature(
            {
                "ward_code": "G01001001",
                "lb_code": "G01001",
                "lb_name": "Alpha West",
                "lb_type": "Grama Panchayat",
                "district_name": "ALPHA",
                "ward_no": "1",
                "ward_name": "KANWATHIRTHA",
                "winner_name": "ഭവ്യഷ് ആർ",
            },
            [[[0, 0], [0.5, 0], [0.5, 1], [0, 1], [0, 0]]],
        ),
        feature(
            {
                "ward_code": "G01001002",
                "lb_code": "G01001",
                "lb_name": "Alpha West",
                "lb_type": "Grama Panchayat",
                "district_name": "ALPHA",
                "ward_no": "2",
                "ward_name": "PAIVALIKE",
            },
            [[[0.5, 0], [1, 0], [1, 1], [0.5, 1], [0.5, 0]]],
        ),
        feature(
            {
                "ward_code": "G01002001",
                "lb_code": "G01002",
                "lb_name": "Alpha East",
                "lb_type": "Grama Panchayat",
                "district_name": "ALPHA",
                "ward_no": "1",
                "ward_name": "MANGALPADY",
            },
            square(1, 0),
        ),
    ],
}


# The 2025 tier layers are shaped differently from the 2015/2020 one: they hold
# one feature per *division*, not one per body, so a block panchayat's outline
# has to be dissolved from its own wards. Alpha Block's two divisions share the
# edge at x=1 and must come back as one rectangle.
BLOCK_DIVISIONS = {
    "type": "FeatureCollection",
    "provenance": {"licence": "KSMART wardmap, no open licence published"},
    "features": [
        feature(
            {
                "lb_code": "B01001",
                "lb_name": "Alpha Block",
                "lb_type": "Block Panchayat",
                "district_name": "ALPHA",
                "ward_code": "B010011",
                "ward_no": "1",
                "ward_name": "ALPHA WEST DIVISION",
            },
            square(0, 0),
        ),
        feature(
            {
                "lb_code": "B01001",
                "lb_name": "Alpha Block",
                "lb_type": "Block Panchayat",
                "district_name": "ALPHA",
                "ward_code": "B010012",
                "ward_no": "2",
                "ward_name": "ALPHA EAST DIVISION",
            },
            square(1, 0),
        ),
    ],
}

DP_DIVISIONS = {
    "type": "FeatureCollection",
    "provenance": {"licence": "KSMART wardmap, no open licence published"},
    "features": [
        feature(
            {
                "lb_code": "D01001",
                "lb_name": "Alpha District Panchayat",
                "lb_type": "District Panchayat",
                "district_name": "ALPHA",
                "ward_code": "D010011",
                "ward_no": "1",
                "ward_name": "ALPHA DIVISION",
            },
            [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]],
        ),
    ],
}


@pytest.fixture
def layers(tmp_path, monkeypatch):
    """A directory holding every layer the build publishes, at fixture size."""
    (tmp_path / "wards_2025.geojson").write_text(
        json.dumps(WARDS, ensure_ascii=False), encoding="utf-8"
    )
    (tmp_path / "block_panchayats_2025.geojson").write_text(
        json.dumps(BLOCK_DIVISIONS), encoding="utf-8"
    )
    (tmp_path / "district_panchayats_2025.geojson").write_text(
        json.dumps(DP_DIVISIONS), encoding="utf-8"
    )
    for year in (2015, 2020, 2025):
        (tmp_path / f"local_bodies_{year}.geojson").write_text(
            json.dumps(LOCAL_BODIES), encoding="utf-8"
        )
    monkeypatch.setattr(settings, "geo_dir", str(tmp_path))
    return tmp_path


# ---------------------------------------------------------------------------
# Slicing
# ---------------------------------------------------------------------------


async def test_a_bodys_wards_come_back_alone(client, layers):
    response = await client.get("/geo/wards/G01001.geojson?cycle=2025")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/geo+json")
    payload = response.json()
    assert payload["level"] == "ward"
    assert payload["key_property"] == "ward_no"
    assert [f["properties"]["ward_no"] for f in payload["features"]] == ["1", "2"]
    # The neighbouring body's ward is in the same file and not in this answer.
    assert all(f["properties"]["lb_code"] == "G01001" for f in payload["features"])


async def test_a_slice_carries_the_layers_own_provenance(client, layers):
    """Two of the real layers are ODbL. The attribution travels with the slice."""
    payload = (await client.get("/geo/wards/G01001.geojson?cycle=2025")).json()

    assert "KSMART" in payload["provenance"]["licence"]

    bodies = (await client.get("/geo/local-bodies/ALPHA.geojson?cycle=2020")).json()
    assert "OpenStreetMap" in bodies["provenance"]["licence"]


async def test_a_slice_drops_the_result_columns_the_api_already_carries(client, layers):
    payload = (await client.get("/geo/wards/G01001.geojson?cycle=2025")).json()

    properties = payload["features"][0]["properties"]
    assert properties["ward_name"] == "KANWATHIRTHA"
    assert "winner_name" not in properties


async def test_a_district_slice_leaves_out_the_overlapping_levels(client, layers):
    payload = (await client.get("/geo/local-bodies/ALPHA.geojson?cycle=2020")).json()

    codes = sorted(f["properties"]["lb_code"] for f in payload["features"])
    assert codes == ["G01001", "G01002"]


async def test_a_district_name_is_matched_case_insensitively(client, layers):
    payload = (await client.get("/geo/local-bodies/alpha.geojson?cycle=2025")).json()

    assert len(payload["features"]) == 2


async def test_district_outlines_dissolve_the_shared_border(client, layers):
    """Two panchayats sharing an edge come back as one rectangle, not two squares."""
    payload = (await client.get("/geo/districts/2025.geojson")).json()

    districts = {f["properties"]["district_name"]: f for f in payload["features"]}
    assert sorted(districts) == ["ALPHA", "BETA"]

    alpha = districts["ALPHA"]
    assert alpha["properties"]["bodies"] == 2
    assert alpha["geometry"]["type"] == "MultiPolygon"
    assert len(alpha["geometry"]["coordinates"]) == 1

    ring = alpha["geometry"]["coordinates"][0][0]
    corners = {(x, y) for x, y in ring}
    assert corners == {(0.0, 0.0), (2.0, 0.0), (2.0, 1.0), (0.0, 1.0)}


async def test_a_cycle_with_no_ward_geometry_says_so(client, layers):
    response = await client.get("/geo/wards/G01001.geojson?cycle=2020")

    assert response.status_code == 404
    assert response.json()["detail"] == (
        "No ward boundaries have been published for the 2020 election."
    )


async def test_2010_has_no_local_body_layer_either(client, layers):
    response = await client.get("/geo/districts/2010.geojson")

    assert response.status_code == 404
    assert "2010" in response.json()["detail"]


async def test_a_year_that_is_not_a_cycle_is_unprocessable(client, layers):
    response = await client.get("/geo/districts/2023.geojson")

    assert response.status_code == 422
    assert "2010, 2015, 2020, 2025" in response.json()["detail"]


async def test_an_unknown_body_answers_an_empty_collection(client, layers):
    """A body with no polygon is a stated absence, not a 404: the code is real,
    the geometry is what is missing."""
    payload = (await client.get("/geo/wards/G09999.geojson?cycle=2025")).json()

    assert payload["features"] == []
    assert payload["lb_code"] == "G09999"


async def test_slicing_an_unmounted_server_states_the_cause(client, layers, unmounted):
    response = await client.get("/geo/wards/G01001.geojson?cycle=2025")

    assert response.status_code == 404
    assert response.json()["detail"] == (
        "This server holds no boundary files, so none can be downloaded."
    )


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------


async def test_a_slice_revalidates_with_an_etag(client, layers):
    first = await client.get("/geo/wards/G01001.geojson?cycle=2025")
    etag = first.headers["etag"]
    assert first.headers["cache-control"].startswith("public, max-age=")

    again = await client.get(
        "/geo/wards/G01001.geojson?cycle=2025", headers={"If-None-Match": etag}
    )
    assert again.status_code == 304
    assert again.content == b""


async def test_the_layer_is_walked_once_however_many_slices_are_cut(client, layers, monkeypatch):
    """The point of the index. Re-parsing 57 MB per request is the failure this
    endpoint exists to avoid, and it is invisible in the payload."""
    builds = []
    original = geo_store._build_index

    def counted(path):
        builds.append(str(path))
        return original(path)

    monkeypatch.setattr(geo_store, "_build_index", counted)

    for url in (
        "/geo/wards/G01001.geojson?cycle=2025",
        "/geo/wards/G01002.geojson?cycle=2025",
        "/geo/wards/G01001.geojson?cycle=2025",
    ):
        assert (await client.get(url)).status_code == 200

    assert len(builds) == 1


async def test_a_rebuilt_layer_is_re_indexed(client, layers):
    """The index is held for the life of the process, so a redeployed layer has
    to invalidate it. Size and mtime are what say it changed."""
    before = (await client.get("/geo/wards/G01001.geojson?cycle=2025")).json()
    assert len(before["features"]) == 2

    trimmed = {**WARDS, "features": WARDS["features"][:1]}
    path = layers / "wards_2025.geojson"
    path.write_text(json.dumps(trimmed, ensure_ascii=False), encoding="utf-8")
    geo_store._slice_cache.clear()

    after = (await client.get("/geo/wards/G01001.geojson?cycle=2025")).json()
    assert len(after["features"]) == 1


# ---------------------------------------------------------------------------
# The geometry helpers
# ---------------------------------------------------------------------------


def test_simplify_drops_a_point_on_the_line_and_keeps_the_corner():
    line = [(0.0, 0.0), (1.0, 0.0001), (2.0, 0.0), (2.0, 2.0)]

    assert geo_store.simplify(line, 0.01) == [(0.0, 0.0), (2.0, 0.0), (2.0, 2.0)]
    assert len(geo_store.simplify(line, 0.00001)) == 4


def test_simplify_keeps_the_ends_of_a_two_point_ring():
    assert geo_store.simplify([(0.0, 0.0), (1.0, 1.0)], 10.0) == [(0.0, 0.0), (1.0, 1.0)]


# ---------------------------------------------------------------------------
# Tiers
#
# Three separately elected bodies cover the same ground: a grama panchayat, the
# block panchayat above it, the district panchayat above that. The filter that
# used to keep them from stacking was global, which meant the two upper tiers
# could never be drawn at all. It is a choice of level now, and these tests
# pin both halves of that: each level answers its own tier complete, and no
# level answers two.
# ---------------------------------------------------------------------------


async def test_a_block_tier_is_served_from_the_body_layer(client, layers):
    """2015 and 2020 draw block panchayats as whole bodies."""
    payload = (await client.get("/geo/blocks/ALPHA.geojson?cycle=2020")).json()

    assert payload["level"] == "block_panchayat"
    assert payload["key_property"] == "lb_code"
    assert [f["properties"]["lb_code"] for f in payload["features"]] == ["B01001"]


async def test_a_block_tier_is_dissolved_from_divisions_for_2025(client, layers):
    """2025 publishes block panchayat *wards*, so the body is their union.

    Two divisions sharing the edge at x=1 come back as one rectangle. A map
    that drew them undissolved would show an internal line that is a division
    boundary, not a block boundary.
    """
    payload = (await client.get("/geo/blocks/ALPHA.geojson?cycle=2025")).json()

    assert [f["properties"]["lb_code"] for f in payload["features"]] == ["B01001"]
    geometry = payload["features"][0]["geometry"]
    assert len(geometry["coordinates"]) == 1
    assert {(x, y) for x, y in geometry["coordinates"][0][0]} == {
        (0.0, 0.0),
        (2.0, 0.0),
        (2.0, 1.0),
        (0.0, 1.0),
    }


async def test_no_tier_is_drawn_under_another(client, layers):
    """The three levels are disjoint. Each answers its own and nothing else."""
    first = (await client.get("/geo/local-bodies/ALPHA.geojson?cycle=2020")).json()
    blocks = (await client.get("/geo/blocks/ALPHA.geojson?cycle=2020")).json()
    districts = (await client.get("/geo/district-panchayats/2020.geojson")).json()

    def codes(payload):
        return {f["properties"]["lb_code"] for f in payload["features"]}

    assert codes(first) == {"G01001", "G01002"}
    assert codes(blocks) == {"B01001"}
    assert codes(districts) == {"D01001"}
    assert codes(first) & codes(blocks) == set()
    assert codes(blocks) & codes(districts) == set()


async def test_district_panchayats_are_the_body_not_the_district(client, layers):
    """`/geo/districts` draws the administrative district; this draws the body."""
    payload = (await client.get("/geo/district-panchayats/2025.geojson")).json()

    assert payload["level"] == "district_panchayat"
    assert [f["properties"]["lb_code"] for f in payload["features"]] == ["D01001"]


async def test_a_tier_with_no_layer_for_the_cycle_says_which_level(client, layers):
    response = await client.get("/geo/blocks/ALPHA.geojson?cycle=2010")

    assert response.status_code == 404
    assert response.json()["detail"] == (
        "No block panchayat boundaries have been published for the 2010 election."
    )


async def test_a_block_panchayats_own_divisions_are_its_wards(client, layers):
    """A block panchayat's ward map comes from its own layer, not the GP one."""
    payload = (await client.get("/geo/wards/B01001.geojson?cycle=2025")).json()

    assert payload["level"] == "ward"
    assert [f["properties"]["ward_no"] for f in payload["features"]] == ["1", "2"]


async def test_a_district_panchayats_own_divisions_are_its_wards(client, layers):
    payload = (await client.get("/geo/wards/D01001.geojson?cycle=2025")).json()

    assert [f["properties"]["ward_no"] for f in payload["features"]] == ["1"]


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------


async def test_membership_places_every_grama_panchayat_in_its_block(client, layers):
    payload = (await client.get("/geo/block-membership.json")).json()

    assert payload["of_block"] == {"G01001": "B01001", "G01002": "B01001"}
    assert payload["blocks"] == [
        {"lb_code": "B01001", "grama_panchayats": ["G01001", "G01002"]}
    ]
    assert payload["count"] == 2
    assert payload["blocks_count"] == 1


async def test_membership_leaves_urban_bodies_out(client, layers):
    """No block panchayat contains a municipality or a corporation."""
    payload = (await client.get("/geo/block-membership.json")).json()

    assert "M02001" not in payload["of_block"]
    assert "C02001" not in payload["of_block"]


async def test_one_blocks_grama_panchayats_can_be_asked_for(client, layers):
    payload = (
        await client.get("/geo/local-bodies/ALPHA.geojson?cycle=2025&block=B01001")
    ).json()

    assert payload["block_lb_code"] == "B01001"
    assert sorted(f["properties"]["lb_code"] for f in payload["features"]) == [
        "G01001",
        "G01002",
    ]


async def test_an_unmounted_server_has_no_membership_rather_than_a_guess(
    client, unmounted
):
    payload = (await client.get("/geo/block-membership.json")).json()

    assert payload["of_block"] == {}
    assert payload["count"] == 0
