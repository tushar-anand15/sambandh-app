"""`/geo/{filename}` and the availability the inventory reports for it.

The layer files are a deployment input, not repository content — 7.5 MB to
57 MB each, built by sulekha's `geo build`. So the two states worth testing are
the mounted one and the unmounted one, and the second has to state its cause:
a zero-byte 200 would be saved by the browser and fail in a GeoJSON parser far
from the reason it failed.
"""

import json

import pytest

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
    assert "GEO_DIR" in response.json()["detail"]


async def test_a_layer_missing_from_the_mount_is_distinguished(client, mounted):
    """2010 is the layer the current build does not emit. It is not a 404 for
    an unknown name and not an empty file — it is a named layer the directory
    does not hold."""
    response = await client.get("/geo/local_bodies_2010.geojson")

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "boundary layer directory" in detail
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
    assert "geo build" in absent["unavailable_reason"]


async def test_the_inventory_names_seven_layers(client, unmounted):
    """Four KSMART 2025 layers and three opendatakerala local-body layers."""
    payload = (await client.get("/api/maps")).json()

    assert payload["count"] == 7
    assert len(payload["layers"]) == 7
    assert sum(1 for layer in payload["layers"] if layer["source"].startswith("KSMART")) == 4
