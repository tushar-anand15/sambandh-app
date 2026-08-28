"""The boundary geometry: whole layers, and the slice a map level needs.

Two shapes of request land here.

`/geo/{filename}` is the download. `/api/maps` declares a URL per layer, and
only the seven filenames in that inventory are servable, so the route reads a
fixed list rather than any path a caller supplies. A missing file answers 404
with the reason in `detail`; a zero-byte 200 would be the worse failure, since a
browser would save it and a GeoJSON parser would fail on it somewhere far from
the cause.

`/geo/districts/{cycle}.geojson` and its siblings are what the map on the
Elections page draws. Each answers the polygons of **one tier** of one cycle
and nothing else — about 30 kB for a body's wards, against the 57 MB layer they
were cut from. The cutting is in `geo_store`; this module is the addressing,
the validation and the cache headers.

One tier per request is the rule, not an implementation detail. A grama
panchayat, the block panchayat above it and the district panchayat above that
cover the same ground; a map that drew two of them would stack polygons and
invite the reading that the upper tier summarises the lower one. It does not.
Each of these routes answers the complete set at the level asked for and
nothing from any other level.

`/geo/block-membership.json` is the exception that makes the drill possible:
which grama panchayats sit inside which block panchayat. It carries no
geometry, only the parentage the master database does not hold.

The slicing is CPU work on a file, so these three are `def` rather than
`async def`: Starlette runs them in its threadpool, and the first request for a
layer, which builds that layer's index, does not hold the event loop.
"""

import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse

from ..geo_store import (
    NO_DIRECTORY,
    NOT_ON_SERVER,
    GeoSlice,
    LayerMissing,
    block_membership,
    blocks_of,
    district_panchayats_of,
    districts_of,
    geo_dir,
    layer_path,
    local_bodies_of,
    wards_of,
)
from ..public import CACHE_CONTROL, VALID_CYCLES, rate_limit
from ..public import _matches as matches_etag  # one ETag rule for every public route
from .maps import LAYERS

router = APIRouter(prefix="/geo", tags=["public"], dependencies=[Depends(rate_limit)])

SERVABLE = {layer["filename"] for layer in LAYERS}

# RFC 7946's media type. A consumer that only knows application/json still
# parses it; one that knows this type reads it as geometry.
GEOJSON = "application/geo+json"


def _geojson(request: Request, cut: GeoSlice) -> Response:
    """A slice with the same caching contract the JSON endpoints carry."""
    headers = {
        "ETag": cut.etag,
        "Cache-Control": CACHE_CONTROL,
        "Vary": "Accept-Encoding",
    }
    if matches_etag(request.headers.get("if-none-match"), cut.etag):
        return Response(status_code=304, headers=headers)
    return Response(content=cut.body, media_type=GEOJSON, headers=headers)


def _cycle(cycle: int) -> int:
    if cycle not in VALID_CYCLES:
        raise HTTPException(
            status_code=422,
            detail=f"{cycle} is not an election cycle. The cycles are "
            + ", ".join(str(year) for year in VALID_CYCLES)
            + ".",
        )
    return cycle


def _sliced(build) -> Response:
    try:
        return build()
    except LayerMissing as missing:
        raise HTTPException(status_code=404, detail=missing.reason) from missing


@router.get("/districts/{cycle}.geojson")
def district_geometry(request: Request, cycle: int):
    """Kerala's fourteen districts, as one outline each."""
    year = _cycle(cycle)
    return _sliced(lambda: _geojson(request, districts_of(year)))


@router.get("/district-panchayats/{cycle}.geojson")
def district_panchayat_geometry(request: Request, cycle: int):
    """The fourteen district panchayats, as their own territories.

    Not the same shape as `/geo/districts/{cycle}.geojson`. That draws the
    administrative district; this draws the elected body, which does not include
    the municipalities and corporations inside the district and so has holes
    where they sit.
    """
    year = _cycle(cycle)
    return _sliced(lambda: _geojson(request, district_panchayats_of(year)))


@router.get("/blocks/{district}.geojson")
def block_geometry(
    request: Request,
    district: str,
    cycle: int = Query(..., description="An election cycle: 2010, 2015, 2020 or 2025."),
):
    """Every block panchayat in one district, coloured by its own election.

    The complete set at that level, never a subset, and never an aggregate over
    the grama panchayats inside them: a block panchayat is elected on its own
    ballot to its own body.
    """
    year = _cycle(cycle)
    return _sliced(lambda: _geojson(request, blocks_of(district.upper(), year)))


@router.get("/local-bodies/{district}.geojson")
def local_body_geometry(
    request: Request,
    district: str,
    cycle: int = Query(..., description="An election cycle: 2010, 2015, 2020 or 2025."),
    block: str | None = Query(
        None,
        description="A block panchayat lb_code. Narrows the answer to the grama "
        "panchayats inside that block.",
    ),
):
    """One district's local bodies, at Grama Panchayat / Municipality / Corporation level.

    Block and District Panchayats are left out — they are their own tiers, at
    `/geo/blocks/{district}.geojson` and `/geo/district-panchayats/{cycle}.geojson`,
    and drawing them here would stack three polygons on every point.

    `block` steps one level into the rural hierarchy and answers that block's
    grama panchayats. Municipalities and corporations drop out under it: no
    block panchayat contains one.
    """
    year = _cycle(cycle)
    parent = block.upper() if block else None
    return _sliced(
        lambda: _geojson(request, local_bodies_of(district.upper(), year, parent))
    )


@router.get("/block-membership.json")
def block_membership_map(request: Request):
    """Which block panchayat each grama panchayat sits in.

    The master database carries a body's district and its type and no parent,
    so this is derived from the published geometry: a block panchayat is
    exactly the union of its grama panchayats, so a point inside one is inside
    its block and no other.

    Membership is stated once rather than per cycle. Every layer the build
    publishes — 2015, 2020 and 2025 — is crosswalked onto the same November 2020
    boundary snapshot and describes the same 1,033 first-tier bodies and 152
    block panchayats, so a per-cycle answer would be the same answer three
    times. `unplaced` is where that stops being true: bodies the layers do not
    hold, which is every body that contested in 2010 and had no successor.

    Empty where no layer that draws block panchayats as whole bodies is on this
    server. The caller then offers no tier drill rather than an incomplete one.
    """
    membership = block_membership()
    blocks: dict[str, list[str]] = {}
    for grama_panchayat, block in sorted(membership.items()):
        blocks.setdefault(block, []).append(grama_panchayat)

    body = {
        "of_block": membership,
        "blocks": [
            {"lb_code": block, "grama_panchayats": members}
            for block, members in sorted(blocks.items())
        ],
        "count": len(membership),
        "blocks_count": len(blocks),
    }
    encoded = json.dumps(body, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(encoded).hexdigest()[:32] + '"'
    headers = {"ETag": etag, "Cache-Control": CACHE_CONTROL}
    if matches_etag(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)
    return Response(content=encoded, media_type="application/json", headers=headers)


@router.get("/wards/{lb_code}.geojson")
def ward_geometry(
    request: Request,
    lb_code: str,
    cycle: int = Query(..., description="An election cycle: 2010, 2015, 2020 or 2025."),
):
    """One local body's wards. Ward polygons exist for the 2025 cycle only."""
    year = _cycle(cycle)
    return _sliced(lambda: _geojson(request, wards_of(lb_code.upper(), year)))


@router.get("/{filename}")
async def geo_layer(request: Request, filename: str):
    if filename not in SERVABLE:
        raise HTTPException(
            status_code=404,
            detail=f"{filename} is not one of the {len(SERVABLE)} boundary layers. "
            "The inventory is at /api/maps.",
        )

    path = layer_path(filename)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail=NO_DIRECTORY if geo_dir() is None else NOT_ON_SERVER,
        )

    return FileResponse(
        path,
        media_type=GEOJSON,
        filename=filename,
        headers={"Cache-Control": CACHE_CONTROL},
    )
