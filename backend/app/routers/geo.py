"""The boundary geometry: whole layers, and the slice a map level needs.

Two shapes of request land here.

`/geo/{filename}` is the download. `/api/maps` declares a URL per layer, and
only the seven filenames in that inventory are servable, so the route reads a
fixed list rather than any path a caller supplies. A missing file answers 404
with the reason in `detail`; a zero-byte 200 would be the worse failure, since a
browser would save it and a GeoJSON parser would fail on it somewhere far from
the cause.

`/geo/districts/{cycle}.geojson`, `/geo/local-bodies/{district}.geojson` and
`/geo/wards/{lb_code}.geojson` are what the map on the Elections page draws.
Each answers the polygons of one level of one cycle and nothing else — about
30 kB for a body's wards, against the 57 MB layer they were cut from. The
cutting is in `geo_store`; this module is the addressing, the validation and
the cache headers.

The slicing is CPU work on a file, so these three are `def` rather than
`async def`: Starlette runs them in its threadpool, and the first request for a
layer, which builds that layer's index, does not hold the event loop.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse

from ..geo_store import (
    NO_DIRECTORY,
    NOT_ON_SERVER,
    GeoSlice,
    LayerMissing,
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


@router.get("/local-bodies/{district}.geojson")
def local_body_geometry(
    request: Request,
    district: str,
    cycle: int = Query(..., description="An election cycle: 2010, 2015, 2020 or 2025."),
):
    """One district's local bodies, at Grama Panchayat / Municipality / Corporation level.

    Block and District Panchayats are left out. They cover ground the bodies
    here already cover, so a map that drew all of them would stack three
    polygons on every point in the district.
    """
    year = _cycle(cycle)
    return _sliced(lambda: _geojson(request, local_bodies_of(district.upper(), year)))


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
