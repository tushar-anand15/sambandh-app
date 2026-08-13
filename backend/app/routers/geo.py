"""The boundary layer files themselves, served from the configured directory.

`/api/maps` declares a URL per layer. This is what answers it. Only the seven
filenames in that inventory are servable, so the route reads a fixed list
rather than any path a caller supplies.

A missing file answers 404 with the reason in `detail`. A zero-byte 200 would
be the worse failure: a browser would save it, and a GeoJSON parser would fail
on it somewhere far from the cause.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from ..geo_store import NO_DIRECTORY, NOT_ON_SERVER, geo_dir, layer_path
from ..public import CACHE_CONTROL, rate_limit
from .maps import LAYERS

router = APIRouter(prefix="/geo", tags=["public"], dependencies=[Depends(rate_limit)])

SERVABLE = {layer["filename"] for layer in LAYERS}


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
        # RFC 7946's media type. A consumer that only knows application/json
        # still parses it; one that knows this type reads it as geometry.
        media_type="application/geo+json",
        filename=filename,
        headers={"Cache-Control": CACHE_CONTROL},
    )
