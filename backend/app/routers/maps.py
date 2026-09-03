"""Map layers — the inventory, with each layer's provenance attached.

The boundary story is stated, not smoothed. Ward polygons exist for 2025 only,
from KSMART's vector tiles. The 2010, 2015 and 2020 cycles all reuse a single
November 2020 opendatakerala snapshot, because no per-cycle ward geometry has
ever been published in Kerala — so ``per_cycle_delimitation`` is true for one
cycle and false for two, and the map has to say which it is showing.

The layer files themselves are emitted by ``sulekha``'s ``geo build`` and served
as static assets; this endpoint is the inventory and the licence trail, so no
page hardcodes an attribution it is legally required to carry.
"""

from typing import Any

from fastapi import APIRouter, Depends, Request

from ..database import get_pool
from ..geo_store import layer_status
from ..public import provenance, public_json, rate_limit

router = APIRouter(prefix="/api/maps", tags=["public"], dependencies=[Depends(rate_limit)])

KSMART = {
    "source": "KSMART ward maps",
    "boundary_vintage": "as published by KSMART",
    # Live: KSMART serves whatever it currently holds, so there is no snapshot
    # date to give. `None` says that, where a phrase like "as published today"
    # only takes up room.
    "snapshot": None,
    "per_cycle_delimitation": True,
    "licence": None,
    "licence_note": "Redistribution terms are unstated.",
    "attribution": "KSMART, Government of Kerala",
}

OSM = {
    "source": "opendatakerala, from OpenStreetMap",
    "boundary_vintage": "November 2020",
    # One snapshot backs every cycle drawn from this source, so the 2015 and
    # 2010 shapes are 2020 boundaries standing in for older ones. That is worth
    # a reader's attention and is the reason this field exists.
    "snapshot": "November 2020",
    "licence": "ODbL 1.0",
    "licence_note": "Attribution required on any redistribution, including a rendered image.",
    "attribution": "© OpenStreetMap contributors",
}

LAYERS: list[dict[str, Any]] = [
    {
        "id": "wards_2025",
        "label": "Wards, 2025",
        "level": "ward",
        "cycle": 2025,
        "filename": "wards_2025.geojson",
        **KSMART,
    },
    {
        "id": "local_bodies_2025",
        "label": "Local bodies, 2025",
        "level": "local_body",
        "cycle": 2025,
        "filename": "local_bodies_2025.geojson",
        **KSMART,
    },
    {
        "id": "block_panchayats_2025",
        "label": "Block panchayats, 2025",
        "level": "block_panchayat",
        "cycle": 2025,
        "filename": "block_panchayats_2025.geojson",
        **KSMART,
    },
    {
        "id": "district_panchayats_2025",
        "label": "District panchayats, 2025",
        "level": "district_panchayat",
        "cycle": 2025,
        "filename": "district_panchayats_2025.geojson",
        **KSMART,
    },
    {
        "id": "local_bodies_2020",
        "label": "Local bodies, 2020",
        "level": "local_body",
        "cycle": 2020,
        "filename": "local_bodies_2020.geojson",
        **OSM,
        "per_cycle_delimitation": True,
        "note": "Drawn the same year as this election.",
    },
    {
        "id": "local_bodies_2015",
        "label": "Local bodies, 2015",
        "level": "local_body",
        "cycle": 2015,
        "filename": "local_bodies_2015.geojson",
        **OSM,
        "per_cycle_delimitation": False,
        "note": "The November 2020 boundaries reused. Nothing has been published for 2015.",
    },
    {
        "id": "local_bodies_2010",
        "label": "Local bodies, 2010",
        "level": "local_body",
        "cycle": 2010,
        "filename": "local_bodies_2010.geojson",
        **OSM,
        "per_cycle_delimitation": False,
        "note": (
            "The November 2020 boundaries reused, and the roughest fit of the three. "
            "47 of 2010's 1,208 local bodies had changed by 2020 and are not on this map."
        ),
    },
]

WARD_GEOMETRY_NOTE = (
    "Ward boundaries exist for 2025 only. For 2010, 2015 and 2020 the only "
    "published boundaries are whole local bodies, from opendatakerala."
)


@router.get("")
async def map_inventory(request: Request):
    pool = await get_pool()
    async with pool.acquire() as conn:
        coverage = await conn.fetchrow(
            """
            SELECT count(*)                                  AS bodies,
                   count(*) FILTER (WHERE has_geometry)      AS with_geometry,
                   count(*) FILTER (WHERE NOT has_geometry
                                       OR has_geometry IS NULL) AS without_geometry
            FROM core.lb_coverage
            """
        )

    return public_json(
        request,
        {
            "layers": [
                {
                    **layer,
                    "url": f"/geo/{layer['filename']}",
                    "format": "geojson",
                    # Whether this server holds the file, and its size. A layer
                    # the deployment has not mounted is named here with the
                    # reason, so the page states it instead of offering a
                    # download that 404s.
                    **layer_status(layer["filename"]),
                }
                for layer in LAYERS
            ],
            "count": len(LAYERS),
            "coverage": {
                "bodies": coverage["bodies"],
                "with_geometry": coverage["with_geometry"],
                # Absent from the map with a stated reason, and still reachable
                # through the dropdown.
                "without_geometry": coverage["without_geometry"],
            },
            "ward_geometry_note": WARD_GEOMETRY_NOTE,
            "provenance": provenance("maps"),
        },
    )
