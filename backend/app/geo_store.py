"""Where the boundary layers live on disk, and how one body's share is cut out.

The seven layers `sulekha`'s `geo build` emits are between 7.5 MB and 57 MB.
Nothing that size belongs in a git repository, so the files are a deployment
input: mount the directory that holds them and set `GEO_DIR`.

Two things are served from those files.

**The whole file**, for a reader who wants the layer. `/api/maps` asks
`layer_status` so the inventory can state which layers this server actually
holds, and `/geo/{file}` asks `layer_path` so a request for a file that is not
there answers with the reason rather than an empty body.

**One page's worth of it**, for the map. Drawing Chalakudy's 37 wards needs
about 30 kB of the 57 MB `wards_2025.geojson`, so the map endpoints cut that
slice here. The cut is done twice, not once per request:

1. `_index_for` walks a layer once and records, per `lb_code`, the byte offsets
   of that body's features. Walking 57 MB costs about half a second and happens
   on the first request that needs the layer; every later request seeks to the
   recorded offsets instead. The index is held for the life of the process and
   is rebuilt only when the file's size or mtime changes.
2. `_slice_cache` holds the finished bytes of the last few answers, keyed by
   what was asked for, so a reader stepping back up the breadcrumb pays
   nothing.

Coordinates are simplified and rounded on the way out, at a tolerance chosen
per level: a state map that is 800 px wide cannot show a 100 m wiggle, and
sending it costs ten times what the map draws. The tolerances are stated as
metres in the constants below.

District outlines are not published as a layer, so `district_outlines` builds
them: it takes the cycle's Grama Panchayat, Municipality and Corporation
polygons, drops every border segment that two of them share, and stitches what
is left into rings. That is a dissolve, done with a dict rather than a geometry
library, and it holds because two neighbours digitized from the same source
carry the identical border vertices. Where they do not, the border survives as
an interior line, which draws as a seam rather than failing.
"""

from __future__ import annotations

import hashlib
import json
import threading
from collections import Counter, OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .config import settings


def geo_dir() -> Path | None:
    """The configured directory, or None when GEO_DIR is unset."""
    configured = settings.geo_dir.strip()
    return Path(configured) if configured else None


def layer_path(filename: str) -> Path | None:
    """The readable file for `filename`, or None when it is not on this server.

    `filename` is matched against the inventory by the caller; the only path
    handling here is a basename check, so a name carrying a directory
    separator or a parent reference resolves to nothing.
    """
    directory = geo_dir()
    if directory is None or filename != Path(filename).name:
        return None

    path = directory / filename
    return path if path.is_file() else None


# Why a layer named in the inventory cannot be downloaded from this server. The
# two cases are different operational problems and are worth telling apart:
# nothing is mounted, or the mount is missing one file.
NO_DIRECTORY = "This server holds no boundary files, so none can be downloaded."
NOT_ON_SERVER = "This boundary file is not on this server."


def layer_status(filename: str) -> dict[str, Any]:
    """`available`, `bytes` and, when absent, the reason — for one layer."""
    path = layer_path(filename)
    if path is None:
        return {
            "available": False,
            "bytes": None,
            "unavailable_reason": NO_DIRECTORY if geo_dir() is None else NOT_ON_SERVER,
        }
    return {
        "available": True,
        "bytes": path.stat().st_size,
        "unavailable_reason": None,
    }


# ---------------------------------------------------------------------------
# Which file holds which cycle's geometry
# ---------------------------------------------------------------------------

# Ward polygons exist for 2025 alone. The 2010, 2015 and 2020 cycles have
# local-body polygons and nothing below them, and 2010's local-body layer is
# not emitted by the current build at all. A cycle absent from a table here has
# no geometry at that level, and the endpoint says so rather than drawing an
# approximation of a boundary nobody published.
WARD_LAYER: dict[int, str] = {2025: "wards_2025.geojson"}

LOCAL_BODY_LAYER: dict[int, str] = {
    2015: "local_bodies_2015.geojson",
    2020: "local_bodies_2020.geojson",
    2025: "local_bodies_2025.geojson",
}

# ---------------------------------------------------------------------------
# Tiers
# ---------------------------------------------------------------------------

# A voter in rural Kerala elects three bodies over the same ground: a grama
# panchayat, a block panchayat and a district panchayat. Each is drawn on its
# own map, never on top of another, so a tier is a *choice of level* rather
# than a filter applied everywhere. `TIERS` names which `lb_type` values belong
# to each choice; a request names one tier and gets the complete set at it.
#
# Municipalities and Corporations sit in the first tier because that is the
# level they tile at, but they are outside the rural hierarchy: no block
# panchayat contains one, and they are listed alongside a district's blocks
# rather than nested under them.
GRAMA_PANCHAYAT = "Grama Panchayat"
BLOCK_PANCHAYAT = "Block Panchayat"
DISTRICT_PANCHAYAT = "District Panchayat"

TIERS: dict[str, frozenset[str]] = {
    "local_body": frozenset({GRAMA_PANCHAYAT, "Municipality", "Corporation"}),
    "block_panchayat": frozenset({BLOCK_PANCHAYAT}),
    "district_panchayat": frozenset({DISTRICT_PANCHAYAT}),
}

# The tier that tiles the state exactly once and is what a district outline is
# dissolved from. Named separately because `districts_of` means this set and
# not "whatever tier was asked for".
DIRECT_TYPES = TIERS["local_body"]

# Where each tier's geometry comes from, per cycle.
#
# 2015 and 2020 publish all three tiers as *body* polygons in one file. 2025
# publishes the first tier as bodies in `local_bodies_2025.geojson` and the
# other two as **divisions** — 2,252 block panchayat wards and 345 district
# panchayat wards, one feature per ward, keyed by the body's `lb_code` and the
# ward's `ward_code`. A block panchayat's outline for 2025 is therefore
# dissolved from its own divisions rather than read off a feature, which is
# what `_by_division` records.
#
# 2010 is absent from every table here, deliberately: no boundary layer was
# published for it and none is invented. See `sulekha/src/geo/build/emit.py`.
BLOCK_LAYER: dict[int, str] = {
    2015: "local_bodies_2015.geojson",
    2020: "local_bodies_2020.geojson",
    2025: "block_panchayats_2025.geojson",
}

DISTRICT_PANCHAYAT_LAYER: dict[int, str] = {
    2015: "local_bodies_2015.geojson",
    2020: "local_bodies_2020.geojson",
    2025: "district_panchayats_2025.geojson",
}

# The 2025 tier files hold one feature per division, so a body is the union of
# its rows. Everything else holds one feature per body.
DIVISION_LAYERS = frozenset(
    {"block_panchayats_2025.geojson", "district_panchayats_2025.geojson"}
)

# The ward layer a body's own divisions come from. Ward geometry exists for the
# 2025 cycle alone, and which file holds it depends on the tier: a grama
# panchayat's wards are in `wards_2025.geojson`, a block panchayat's divisions
# in `block_panchayats_2025.geojson`, a district panchayat's in its own file.
DIVISION_LAYER_BY_TIER: dict[str, dict[int, str]] = {
    "block_panchayat": {2025: "block_panchayats_2025.geojson"},
    "district_panchayat": {2025: "district_panchayats_2025.geojson"},
}

# Simplification tolerance in degrees, per level, with the distance it stands
# for at Kerala's latitude. Each is well under half a pixel at the width the
# level is drawn: the state fills ~800 px across 2.5 degrees, one district
# ~800 px across 1 degree, one body ~800 px across 0.1 degrees.
DISTRICT_TOLERANCE = 0.0010  # ~110 m
BODY_TOLERANCE = 0.0003  # ~33 m
WARD_TOLERANCE = 0.00005  # ~5.5 m

# Output coordinate precision. Five decimals is ~1.1 m, below every tolerance
# above and far below the accuracy either source claims.
PRECISION = 5

# The properties a map needs. The rest of a ward feature repeats the result
# `/api/elections/{lb_code}/{cycle}` already carries, so it is dropped here
# instead of being sent twice.
KEPT_PROPERTIES = (
    "lb_code",
    "lb_name",
    "lb_type",
    "district_name",
    "ward_no",
    "ward_code",
    "ward_name",
)


# ---------------------------------------------------------------------------
# The index
# ---------------------------------------------------------------------------


@dataclass
class LayerIndex:
    """Where each body's features are in one layer file, in bytes."""

    size: int
    mtime_ns: int
    provenance: dict[str, Any] | None
    #: lb_code -> [(offset, length)], in the order the file writes them.
    by_code: dict[str, list[tuple[int, int]]] = field(default_factory=dict)
    #: (tier, district_name) -> lb_codes. One entry per tier the file carries,
    #: so a level can be served without the others being drawn under it.
    by_tier: dict[tuple[str, str], list[str]] = field(default_factory=dict)
    #: lb_code -> district_name, for every body in the file.
    district_of: dict[str, str] = field(default_factory=dict)
    #: lb_code -> lb_type, for every body in the file.
    type_of: dict[str, str] = field(default_factory=dict)
    #: lb_code -> lb_name, where the file carries one.
    name_of: dict[str, str] = field(default_factory=dict)

    @property
    def direct_by_district(self) -> dict[str, list[str]]:
        """district_name -> the bodies that tile it exactly once.

        What `districts_of` dissolves and what the first tier serves. Derived
        from `by_tier` rather than stored beside it, so the two cannot drift.
        """
        return {
            district: codes
            for (tier, district), codes in self.by_tier.items()
            if tier == "local_body"
        }

    def codes(self, tier: str, district: str) -> list[str]:
        return self.by_tier.get((tier, district), [])


_indexes: dict[str, LayerIndex] = {}
_index_lock = threading.Lock()


def _build_index(path: Path) -> LayerIndex:
    """Walk one layer once, recording every feature's byte range.

    The file is read as text so `json.JSONDecoder.raw_decode` can hand back both
    the parsed feature and the offset it ended at; the running byte offset is
    kept alongside, because Malayalam names make character offsets and byte
    offsets different numbers. The parsed feature is dropped as soon as its
    properties have been read, so peak memory is the file plus one feature.
    """
    stat = path.stat()
    text = path.read_text(encoding="utf-8")
    index = LayerIndex(size=stat.st_size, mtime_ns=stat.st_mtime_ns, provenance=None)

    decoder = json.JSONDecoder()

    marker = text.find('"provenance"')
    if marker != -1:
        # `raw_decode` starts where it is told, so the whitespace a pretty-printed
        # layer puts after the colon has to be stepped over first.
        at = text.find(":", marker + len('"provenance"')) + 1
        while at < len(text) and text[at] in " \t\r\n":
            at += 1
        provenance, _ = decoder.raw_decode(text, at)
        if isinstance(provenance, dict):
            index.provenance = provenance

    features_at = text.find('"features"')
    if features_at == -1:
        return index
    position = text.index("[", features_at) + 1

    byte_position = len(text[:position].encode("utf-8"))
    previous_end = position

    while True:
        while position < len(text) and text[position] in " \t\r\n,":
            position += 1
        if position >= len(text) or text[position] == "]":
            break

        feature, end = decoder.raw_decode(text, position)
        byte_position += len(text[previous_end:position].encode("utf-8"))
        length = len(text[position:end].encode("utf-8"))

        properties = feature.get("properties") or {}
        code = properties.get("lb_code")
        if code:
            index.by_code.setdefault(code, []).append((byte_position, length))
            lb_type = properties.get("lb_type")
            district = properties.get("district_name")
            if district and code not in index.district_of:
                index.district_of[code] = district
                if lb_type:
                    index.type_of[code] = lb_type
                if properties.get("lb_name"):
                    index.name_of[code] = properties["lb_name"]
                # A body is listed under exactly one tier, so no level can draw
                # it twice and no two levels can draw the same ground.
                for tier, members in TIERS.items():
                    if lb_type in members:
                        index.by_tier.setdefault((tier, district), []).append(code)
                        break

        byte_position += length
        previous_end = end
        position = end

    return index


def _index_for(path: Path) -> LayerIndex:
    """The index for one layer, built on first use and rebuilt if the file moves."""
    key = str(path)
    stat = path.stat()
    with _index_lock:
        held = _indexes.get(key)
        if held and held.size == stat.st_size and held.mtime_ns == stat.st_mtime_ns:
            return held
        index = _build_index(path)
        _indexes[key] = index
        return index


def _read_features(path: Path, ranges: Iterable[tuple[int, int]]) -> list[dict[str, Any]]:
    """The features at those byte ranges, parsed."""
    features: list[dict[str, Any]] = []
    with path.open("rb") as handle:
        for offset, length in ranges:
            handle.seek(offset)
            features.append(json.loads(handle.read(length).decode("utf-8")))
    return features


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

Point = tuple[float, float]
Ring = list[Point]


def simplify(points: Ring, tolerance: float) -> Ring:
    """Douglas-Peucker, iterative, keeping the first and last point.

    Applied to each ring on its own. Two neighbours' copies of a border they
    share can diverge under that, by up to the tolerance — which is why the
    tolerances above are set below half a pixel at the level they are used, so
    the divergence has nowhere to show.
    """
    if len(points) < 3:
        return points

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    square_tolerance = tolerance * tolerance

    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue
        ax, ay = points[start]
        dx, dy = points[end][0] - ax, points[end][1] - ay
        span = dx * dx + dy * dy

        furthest = -1.0
        at = -1
        for i in range(start + 1, end):
            px, py = points[i]
            if span == 0:
                distance = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / span
                t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
                distance = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if distance > furthest:
                furthest = distance
                at = i

        if furthest > square_tolerance:
            keep[at] = True
            stack.append((start, at))
            stack.append((at, end))

    return [point for point, kept in zip(points, keep) if kept]


def _rings(geometry: dict[str, Any]) -> list[Ring]:
    """Every ring in a Polygon or MultiPolygon, exterior and hole alike."""
    if not geometry:
        return []
    coordinates = geometry.get("coordinates") or []
    polygons = coordinates if geometry.get("type") == "MultiPolygon" else [coordinates]
    return [
        [(float(x), float(y)) for x, y in ring]
        for polygon in polygons
        for ring in polygon
        if len(ring) >= 4
    ]


def _round(ring: Ring) -> list[list[float]]:
    return [[round(x, PRECISION), round(y, PRECISION)] for x, y in ring]


def _as_multipolygon(rings: list[Ring]) -> dict[str, Any]:
    """One ring per polygon.

    Holes are kept as separate rings rather than nested inside the polygon that
    contains them, because the containment test costs more than the renderer's
    even-odd fill rule, which subtracts them for free.
    """
    return {
        "type": "MultiPolygon",
        "coordinates": [[_round(ring)] for ring in rings],
    }


def _simplified_feature(feature: dict[str, Any], tolerance: float) -> dict[str, Any]:
    properties = feature.get("properties") or {}
    rings = []
    for ring in _rings(feature.get("geometry") or {}):
        reduced = simplify(ring, tolerance)
        if len(reduced) >= 4:
            rings.append(reduced)
    return {
        "type": "Feature",
        "properties": {
            key: properties[key] for key in KEPT_PROPERTIES if key in properties
        },
        "geometry": _as_multipolygon(rings),
    }


def _ring_area(ring: Ring) -> float:
    """Twice the signed shoelace area, halved. Sign is winding, not size."""
    total = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        total += x1 * y2 - x2 * y1
    return total / 2


def _stitch(segments: list[tuple[Point, Point]]) -> list[Ring]:
    """Walk a set of undirected edges into closed rings.

    Every vertex on a dissolved outline has exactly two edges, so the walk is
    unambiguous almost everywhere. Where it is not — a pinch point where two
    parts of a district meet at a single vertex — any unused edge is taken, and
    where a chain dead-ends the ring is closed back to its start. Both leave a
    drawable outline instead of dropping the district.
    """
    adjacency: dict[Point, list[tuple[Point, int]]] = {}
    for i, (a, b) in enumerate(segments):
        adjacency.setdefault(a, []).append((b, i))
        adjacency.setdefault(b, []).append((a, i))

    used = [False] * len(segments)
    rings: list[Ring] = []

    for i, (a, b) in enumerate(segments):
        if used[i]:
            continue
        used[i] = True
        ring = [a, b]
        current = b
        while current != ring[0]:
            step = next(((o, j) for o, j in adjacency[current] if not used[j]), None)
            if step is None:
                break
            used[step[1]] = True
            ring.append(step[0])
            current = step[0]
        if len(ring) >= 4:
            if ring[-1] != ring[0]:
                ring.append(ring[0])
            rings.append(ring)

    return rings


def _dissolve(features: list[dict[str, Any]], key: str) -> dict[str, list[Ring]]:
    """Group features by a property and drop every border two of them share."""
    counts: dict[str, Counter] = {}
    for feature in features:
        group = (feature.get("properties") or {}).get(key)
        if not group:
            continue
        counter = counts.setdefault(group, Counter())
        for ring in _rings(feature.get("geometry") or {}):
            quantized = [(round(x, 6), round(y, 6)) for x, y in ring]
            for a, b in zip(quantized, quantized[1:]):
                if a != b:
                    counter[(a, b) if a < b else (b, a)] += 1

    outlines: dict[str, list[Ring]] = {}
    for group, counter in counts.items():
        boundary = [segment for segment, seen in counter.items() if seen == 1]
        rings = [ring for ring in _stitch(boundary) if abs(_ring_area(ring)) > 1e-7]
        rings.sort(key=lambda ring: -abs(_ring_area(ring)))
        outlines[group] = rings
    return outlines


# ---------------------------------------------------------------------------
# The answers
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GeoSlice:
    """A finished GeoJSON body and the ETag over it."""

    body: bytes
    etag: str


_slice_cache: OrderedDict[tuple, GeoSlice] = OrderedDict()
_slice_lock = threading.Lock()
# Each entry is a few tens of kB and one district's outlines is ~150 kB, so the
# whole cache is single-digit megabytes at worst.
SLICE_CACHE_SIZE = 96


def _cached(key: tuple, build) -> GeoSlice:
    with _slice_lock:
        held = _slice_cache.get(key)
        if held is not None:
            _slice_cache.move_to_end(key)
            return held

    made = build()

    with _slice_lock:
        _slice_cache[key] = made
        _slice_cache.move_to_end(key)
        while len(_slice_cache) > SLICE_CACHE_SIZE:
            _slice_cache.popitem(last=False)
    return made


def reset_geo_cache() -> None:
    """Drop every index and slice. For tests, and after a layer is replaced."""
    global _membership
    with _membership_lock:
        _membership = None
    with _index_lock:
        _indexes.clear()
    with _slice_lock:
        _slice_cache.clear()


def _collection(
    features: list[dict[str, Any]], provenance: dict[str, Any] | None, **extra: Any
) -> GeoSlice:
    payload: dict[str, Any] = {"type": "FeatureCollection", **extra}
    if provenance is not None:
        # Carried through unchanged. The opendatakerala layers are ODbL, and the
        # attribution travels with every slice cut out of them.
        payload["provenance"] = provenance
    payload["features"] = features
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return GeoSlice(body=body, etag='"' + hashlib.sha256(body).hexdigest()[:32] + '"')


class LayerMissing(Exception):
    """The layer this level would be drawn from is not on this server."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _resolve(filename: str | None, level: str, cycle: int) -> Path:
    if filename is None:
        raise LayerMissing(
            f"No {level.replace('_', ' ')} boundaries have been published for "
            f"the {cycle} election."
        )
    path = layer_path(filename)
    if path is None:
        raise LayerMissing(NO_DIRECTORY if geo_dir() is None else NOT_ON_SERVER)
    return path


def _tier_of_code(lb_code: str) -> str:
    """Which tier a code belongs to, read off the code itself.

    `lb_code` is the master database's own identifier and its first character
    is the tier: `B` a block panchayat, `D` a district panchayat, `G`/`M`/`C`
    the bodies that tile the state once. Used only to pick which file a body's
    own divisions are in, so a wrong guess is a 404 naming the level rather
    than a wrong shape.
    """
    if lb_code.startswith("B"):
        return "block_panchayat"
    if lb_code.startswith("D"):
        return "district_panchayat"
    return "local_body"


def wards_of(lb_code: str, cycle: int) -> GeoSlice:
    """One body's ward polygons, for a cycle that has ward geometry.

    Which file they are in depends on the body's tier: a grama panchayat's or a
    municipality's wards are in `wards_2025.geojson`, a block panchayat's
    divisions in `block_panchayats_2025.geojson`, a district panchayat's in
    `district_panchayats_2025.geojson`. All three are the 2025 cycle only.
    """
    tier = _tier_of_code(lb_code)
    layer = DIVISION_LAYER_BY_TIER.get(tier, WARD_LAYER)
    path = _resolve(layer.get(cycle), "ward", cycle)

    def build() -> GeoSlice:
        index = _index_for(path)
        ranges = index.by_code.get(lb_code)
        features = [] if ranges is None else _read_features(path, ranges)
        return _collection(
            [_simplified_feature(feature, WARD_TOLERANCE) for feature in features],
            index.provenance,
            level="ward",
            cycle=cycle,
            lb_code=lb_code,
            key_property="ward_no",
        )

    return _cached(("wards", str(path), lb_code, cycle), build)


def local_bodies_of(district: str, cycle: int, block: str | None = None) -> GeoSlice:
    """The Grama Panchayat, Municipality and Corporation polygons of one district.

    `block` narrows the answer to the grama panchayats inside one block
    panchayat — the third step of the tier drill. Municipalities and
    Corporations are dropped when it is given, because no block panchayat
    contains one: they sit outside the rural hierarchy and are listed alongside
    it rather than inside it.
    """
    path = _resolve(LOCAL_BODY_LAYER.get(cycle), "local body", cycle)

    def build() -> GeoSlice:
        index = _index_for(path)
        codes = index.codes("local_body", district)
        if block is not None:
            membership = block_membership()
            codes = [code for code in codes if membership.get(code) == block]
        ranges = [span for code in codes for span in index.by_code.get(code, [])]
        features = _read_features(path, ranges)
        extra: dict[str, Any] = {"district_name": district}
        if block is not None:
            extra["block_lb_code"] = block
        return _collection(
            [_simplified_feature(feature, BODY_TOLERANCE) for feature in features],
            index.provenance,
            level="local_body",
            cycle=cycle,
            key_property="lb_code",
            **extra,
        )

    return _cached(("bodies", str(path), district, cycle, block), build)


def _dissolved_tier(
    path: Path,
    index: LayerIndex,
    codes: list[str],
    tolerance: float,
) -> list[dict[str, Any]]:
    """One feature per body, from a file that publishes its divisions.

    The 2025 block and district panchayat layers hold one feature per ward, so
    a body's outline is the union of its own rows. `_dissolve` does that by
    dropping every border two of them share, which holds because divisions
    scraped from one source carry the identical border vertices.
    """
    ranges = [span for code in codes for span in index.by_code.get(code, [])]
    outlines = _dissolve(_read_features(path, ranges), "lb_code")

    drawn: list[dict[str, Any]] = []
    for code in codes:
        rings = [simplify(ring, tolerance) for ring in outlines.get(code, [])]
        rings = [ring for ring in rings if len(ring) >= 4]
        if not rings:
            continue
        drawn.append(
            {
                "type": "Feature",
                "properties": {
                    "lb_code": code,
                    "lb_name": index.name_of.get(code),
                    "lb_type": index.type_of.get(code),
                    "district_name": index.district_of.get(code),
                },
                "geometry": _as_multipolygon(rings),
            }
        )
    return drawn


def _tier_slice(
    tier: str,
    layers: dict[int, str],
    level_name: str,
    cycle: int,
    district: str | None,
) -> GeoSlice:
    """One tier's bodies, whether the file draws them or their divisions."""
    filename = layers.get(cycle)
    path = _resolve(filename, level_name, cycle)
    by_division = filename in DIVISION_LAYERS

    def build() -> GeoSlice:
        index = _index_for(path)
        if district is None:
            districts = sorted({d for t, d in index.by_tier if t == tier})
        else:
            districts = [district]
        codes = [code for name in districts for code in index.codes(tier, name)]

        if by_division:
            features = _dissolved_tier(path, index, codes, BODY_TOLERANCE)
        else:
            ranges = [span for code in codes for span in index.by_code.get(code, [])]
            features = [
                _simplified_feature(feature, BODY_TOLERANCE)
                for feature in _read_features(path, ranges)
            ]

        extra: dict[str, Any] = {}
        if district is not None:
            extra["district_name"] = district
        return _collection(
            features,
            index.provenance,
            level=tier,
            cycle=cycle,
            key_property="lb_code",
            **extra,
        )

    return _cached((tier, str(path), district, cycle), build)


def blocks_of(district: str, cycle: int) -> GeoSlice:
    """Every block panchayat in one district — the complete set, never a subset.

    Their colour is the block panchayat's **own** election. It is not a summary
    of the grama panchayats inside them; those are a separate ballot to a
    separate body, and a block can be held by one front while most of its
    grama panchayats are held by another.
    """
    return _tier_slice(
        "block_panchayat", BLOCK_LAYER, "block panchayat", cycle, district
    )


def district_panchayats_of(cycle: int) -> GeoSlice:
    """The fourteen district panchayats, as their own territories.

    Not the same shape as a district outline: municipalities and corporations
    are not part of a district panchayat, so its territory has holes where they
    sit. `districts_of` draws the administrative district; this draws the body.
    """
    return _tier_slice(
        "district_panchayat", DISTRICT_PANCHAYAT_LAYER, "district panchayat", cycle, None
    )


# ---------------------------------------------------------------------------
# Which block panchayat a grama panchayat sits in
# ---------------------------------------------------------------------------

# The layer membership is read from, best first. Every published layer
# describes the same 1,033 first-tier bodies and the same 152 block panchayats,
# because 2015, 2020 and 2025 are all crosswalked onto the one November 2020
# snapshot; so membership is derived once rather than per cycle, and the 2020
# file is preferred because it is the one that draws block panchayats as whole
# bodies. Bodies that no longer existed by then — the ones that contested in
# 2010 and had no successor — appear in no layer and get no block, which is
# what the page reports rather than guesses at.
MEMBERSHIP_LAYERS = ("local_bodies_2020.geojson", "local_bodies_2015.geojson")

_membership: dict[str, str] | None = None
_membership_lock = threading.Lock()


def _interior_point(rings: list[Ring]) -> Point | None:
    """A point certainly inside the largest ring of a shape.

    The centroid is not safe here: a crescent-shaped coastal panchayat has its
    centroid outside itself, and Kerala has many of those. This casts a
    horizontal line through the ring's mid-latitude and takes the middle of the
    widest interior span, which is inside the ring by construction.
    """
    if not rings:
        return None
    largest = max(rings, key=lambda ring: abs(_ring_area(ring)))
    ys = [y for _, y in largest]
    y = (min(ys) + max(ys)) / 2

    crossings: list[float] = []
    for (x0, y0), (x1, y1) in zip(largest, largest[1:]):
        if (y0 > y) != (y1 > y):
            crossings.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
    crossings.sort()
    if len(crossings) < 2:
        return (sum(x for x, _ in largest) / len(largest), y)

    spans = [
        (crossings[i + 1] - crossings[i], (crossings[i] + crossings[i + 1]) / 2)
        for i in range(0, len(crossings) - 1, 2)
    ]
    return (max(spans)[1], y)


def _contains(point: Point, rings: list[Ring]) -> bool:
    """Even-odd ray casting across every ring, holes included."""
    x, y = point
    inside = False
    for ring in rings:
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
                inside = not inside
    return inside


def _derive_membership(path: Path) -> dict[str, str]:
    """grama panchayat lb_code -> the block panchayat that contains it.

    Derived from geometry rather than read from a column, because the master
    database carries a body's district and type and no parent. The upstream
    source does carry one — opendatakerala's `Block_QID`, which is what the
    block panchayat polygons were dissolved on — but it is not in this
    application's inputs, and where it can be compared it is the less reliable
    of the two: a handful of identically named panchayats (two Kallaras, two
    Thuravoors, Kalady and Kaladi) carry each other's `LSGI_Code` upstream, so
    the codes disagree with the geometry that was built from them.

    A block panchayat is exactly the union of its grama panchayats, so a point
    inside a grama panchayat is inside its block and no other. That makes this
    a containment test rather than a nearest-neighbour guess, and a body that
    lands in no block gets no block rather than the closest one.
    """
    index = _index_for(path)
    blocks: list[tuple[str, float, float, float, float, list[Ring]]] = []
    for district in {d for t, d in index.by_tier if t == "block_panchayat"}:
        for code in index.codes("block_panchayat", district):
            for feature in _read_features(path, index.by_code.get(code, [])):
                rings = _rings(feature.get("geometry") or {})
                if not rings:
                    continue
                xs = [x for ring in rings for x, _ in ring]
                ys = [y for ring in rings for _, y in ring]
                blocks.append(
                    (code, min(xs), min(ys), max(xs), max(ys), rings)
                )

    membership: dict[str, str] = {}
    for district in {d for t, d in index.by_tier if t == "local_body"}:
        for code in index.codes("local_body", district):
            if index.type_of.get(code) != GRAMA_PANCHAYAT:
                continue
            for feature in _read_features(path, index.by_code.get(code, [])):
                point = _interior_point(_rings(feature.get("geometry") or {}))
                if point is None:
                    continue
                for block, x0, y0, x1, y1, rings in blocks:
                    if x0 <= point[0] <= x1 and y0 <= point[1] <= y1:
                        if _contains(point, rings):
                            membership[code] = block
                            break
    return membership


def block_membership() -> dict[str, str]:
    """The whole state's grama panchayat -> block panchayat map, built once.

    Empty when no layer that draws block panchayats as bodies is on this
    server. An empty map is not an error: it means the tier drill cannot be
    offered, and the caller says so rather than showing an incomplete set.
    """
    global _membership
    with _membership_lock:
        if _membership is not None:
            return _membership

    derived: dict[str, str] = {}
    for filename in MEMBERSHIP_LAYERS:
        path = layer_path(filename)
        if path is not None:
            derived = _derive_membership(path)
            break

    with _membership_lock:
        _membership = derived
        return derived


def districts_of(cycle: int) -> GeoSlice:
    """The fourteen district outlines, dissolved from the cycle's own layer."""
    path = _resolve(LOCAL_BODY_LAYER.get(cycle), "local body", cycle)

    def build() -> GeoSlice:
        index = _index_for(path)
        codes = [code for codes in index.direct_by_district.values() for code in codes]
        ranges = [span for code in codes for span in index.by_code.get(code, [])]
        features = _read_features(path, ranges)
        outlines = _dissolve(features, "district_name")

        drawn = []
        for district, rings in sorted(outlines.items()):
            reduced = [simplify(ring, DISTRICT_TOLERANCE) for ring in rings]
            drawn.append(
                {
                    "type": "Feature",
                    "properties": {
                        "district_name": district,
                        "bodies": len(index.direct_by_district.get(district, [])),
                    },
                    "geometry": _as_multipolygon(
                        [ring for ring in reduced if len(ring) >= 4]
                    ),
                }
            )

        return _collection(
            drawn,
            index.provenance,
            level="district",
            cycle=cycle,
            key_property="district_name",
        )

    return _cached(("districts", str(path), cycle), build)
