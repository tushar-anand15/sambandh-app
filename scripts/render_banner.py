#!/usr/bin/env python
"""Render the masthead banner: Kerala's local bodies, tilted 15 degrees.

Run offline; the site ships the two PNGs this writes and never renders at
request time.

WHY NOT PRETTYMAPS. The brief pointed at prettymaps, and prettymaps is the
right reference for the *look* -- flat fills, hard outlines, water and green
as their own layers. It is the wrong tool for this picture. It pulls from
OpenStreetMap through osmnx, and the layers that give its examples their
character (`building`, `streets`) are millions of features across 39,000 km2;
its own examples are all a few hundred metres across. Meanwhile the thing the
banner should actually show -- the 1,033 local bodies -- is already on disk in
`local_bodies_2025.geojson`, already ODbL-attributed, and needs no network at
all. So: prettymaps' idiom, our data.

THE TILT. Kerala runs north-south, and a masthead is wide and short. Drawn flat
and north-up the state is a thin vertical sliver that has to be cropped to
nothing. Two moves fix that, and they are the whole design:

  1. Rotate so the long axis is horizontal. Not by a right angle -- Kerala runs
     NNW-SSE, so a 90-degree turn leaves it a diagonal ribbon with empty
     corners. The angle comes from the state's own principal axis, which lays
     it flat across the band. North ends up at the left, so the coast runs
     along the bottom and the Western Ghats along the top.
  2. Tilt about 15 degrees off vertical, applied to the COORDINATES rather than
     to a finished raster, so edges stay crisp. The far (inland) edge narrows
     and its rows compress, which is what reads as looking down at the coast.

         s(v) = 1 - (1 - FAR) * v        horizontal scale at inland depth v
         y(v) = v * FAR / (FAR + v * (1 - FAR))

All 1,033 bodies are drawn. An earlier pass cropped to a coastal strip to get
the aspect honestly and kept only 128 of them, which is the wrong trade for a
banner whose subject IS the bodies.

Usage:
    sulekha/.venv/bin/python scripts/render_banner.py [--out frontend/public]

Needs shapely and matplotlib. Neither the backend venv nor a plain install has
them; the sulekha venv does.
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection

GEO = Path(
    os.environ.get(
        "GEO_DIR",
        os.path.expanduser("~/Desktop/abishek_tushar_colab/sulekha/data/final/geo"),
    )
)
LAYER = GEO / "local_bodies_2025.geojson"

#: Far-edge width as a fraction of the near edge. 0.84 is about 15 degrees.
FAR = 0.84

#: Kerala is 279 km wide and 498 km long -- 1.78:1 rotated, against a masthead
#: that wants 6.4:1. Cropping to a coastal strip gets the aspect right and
#: throws the subject away: at 0.30 only 128 of 1,033 bodies survive, because
#: they are spread across the whole width, not gathered on the shore. So the
#: whole state is drawn and the inland axis is compressed to fit instead. Both
#: axes are normalised to 0..1 before the figure's own aspect squashes them,
#: which is where the compression happens. A masthead map is a device, not a
#: measurement, and the caption says so.

#: Aspect of the emitted image, and its width in pixels.
ASPECT = 6.4
WIDTH_PX = 2560

# Palettes match frontend/src/index.css, and the banner is entirely neutral.
# An earlier pass filled the 92 municipalities and corporations with the accent,
# which looked alive and was wrong: #ff6653 means "you can click this"
# everywhere else on the site, and ninety-two unclickable coral shapes in the
# masthead spend that meaning for decoration. Urban bodies are a darker grey
# instead, which still tells them apart from the 941 grama panchayats.
THEMES = {
    "light": dict(
        sea="#e8e8e8", land="#ffffff", edge="#5a5a5a",
        green="#dadada", built="#c8c8c8", back="#f5f5f5",
    ),
    "dark": dict(
        sea="#1a1a1a", land="#161616", edge="#7e7e7e",
        green="#2f2f2f", built="#3a3a3a", back="#0c0c0c",
    ),
}


def rings(geom: dict):
    """Every exterior ring in a Polygon or MultiPolygon, as coordinate lists."""
    kind, coords = geom["type"], geom["coordinates"]
    if kind == "Polygon":
        yield coords[0]
    elif kind == "MultiPolygon":
        for part in coords:
            yield part[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="frontend/public", type=Path)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    features = json.loads(LAYER.read_text())["features"]

    lons = [c[0] for f in features for r in rings(f["geometry"]) for c in r]
    lats = [c[1] for f in features for r in rings(f["geometry"]) for c in r]
    lon0, lon1 = min(lons), max(lons)
    lat0, lat1 = min(lats), max(lats)

    # Equirectangular, scaled so a degree of longitude is its real width at
    # Kerala's latitude. Good enough for a picture; nothing is measured off it.
    kx = math.cos(math.radians((lat0 + lat1) / 2))

    # Planar metres-ish, so the principal axis is computed on real proportions
    # rather than on degrees, which are 10% shorter east-west here.
    pts = [((c[0] - lon0) * kx, c[1] - lat0) for f in features
           for r in rings(f["geometry"]) for c in r]
    mx = sum(p[0] for p in pts) / len(pts)
    my = sum(p[1] for p in pts) / len(pts)
    sxx = sum((p[0] - mx) ** 2 for p in pts)
    syy = sum((p[1] - my) ** 2 for p in pts)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    # Major axis of the covariance, i.e. the direction Kerala actually runs.
    theta = 0.5 * math.atan2(2 * sxy, sxx - syy)
    ct, st = math.cos(-theta), math.sin(-theta)

    def rotate(lon: float, lat: float) -> tuple[float, float]:
        x, y = (lon - lon0) * kx - mx, (lat - lat0) - my
        return x * ct - y * st, x * st + y * ct

    rot = [rotate(c[0], c[1]) for f in features
           for r in rings(f["geometry"]) for c in r]
    ax0, ax1 = min(p[0] for p in rot), max(p[0] for p in rot)
    ay0, ay1 = min(p[1] for p in rot), max(p[1] for p in rot)

    def project(lon: float, lat: float) -> tuple[float, float]:
        """Lay the state flat, then tilt."""
        rx, ry = rotate(lon, lat)
        # u runs the length of the state; v runs across it, sea to Ghats.
        u = (rx - ax0) / (ax1 - ax0)
        v = (ry - ay0) / (ay1 - ay0)
        s = 1.0 - (1.0 - FAR) * v
        y = v * FAR / (FAR + v * (1.0 - FAR))
        return 0.5 + (u - 0.5) * s, y

    def project_ring(ring):
        return [project(c[0], c[1]) for c in ring]

    print(f"  principal axis {math.degrees(theta):+.1f} deg from east")

    for name, C in THEMES.items():
        height_px = int(WIDTH_PX / ASPECT)
        fig = plt.figure(figsize=(WIDTH_PX / 100, height_px / 100), dpi=100)
        ax = fig.add_axes([0, 0, 1, 1])
        ax.set_axis_off()
        ax.set_facecolor(C["sea"])
        fig.patch.set_facecolor(C["sea"])

        polys, colours = [], []
        for f in features:
            props = f["properties"]
            urban = props.get("lb_type") in ("Municipality", "Corporation")
            for ring in rings(f["geometry"]):
                pts = project_ring(ring)
                if len(pts) < 3:
                    continue
                polys.append(pts)
                # Municipalities and corporations, picked out in a darker
                # grey. Never the accent -- see the palette note above.
                colours.append(C["built"] if urban else C["land"])

        ax.add_collection(
            PolyCollection(
                polys,
                facecolors=colours,
                edgecolors=C["edge"],
                linewidths=0.45,
                antialiased=True,
            )
        )

        # The Ghats close the far edge: a band beyond the strip we drew.
        ax.fill_between([0, 1], 1.0, 1.06, color=C["green"], zorder=3)

        ax.set_xlim(0.0, 1.0)
        ax.set_ylim(1.0, 0.0)  # v=1 is inland, and inland is the top
        out = args.out / f"banner-kerala-{name}.png"
        fig.savefig(out, facecolor=C["sea"], dpi=100)
        plt.close(fig)
        print(f"  {out}  {WIDTH_PX}x{height_px}  {len(polys)} rings")

    print(f"\n{len(features)} local bodies, {LAYER.name}")
    print("© OpenStreetMap contributors, ODbL — attribution required on the page.")


if __name__ == "__main__":
    main()
