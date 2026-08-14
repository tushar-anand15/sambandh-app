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

# The three levels that tile the state exactly once. The 2015 and 2020 layers
# also carry Block and District Panchayat polygons, which cover the same ground
# a second and third time; drawing them together would stack three polygons on
# every point in Kerala.
DIRECT_TYPES = frozenset({"Grama Panchayat", "Municipality", "Corporation"})

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
    #: district_name -> lb_codes, Grama Panchayat / Municipality / Corporation only.
    direct_by_district: dict[str, list[str]] = field(default_factory=dict)
    #: lb_code -> district_name, for the bodies above.
    district_of: dict[str, str] = field(default_factory=dict)


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
            if properties.get("lb_type") in DIRECT_TYPES:
                district = properties.get("district_name")
                if district and code not in index.district_of:
                    index.district_of[code] = district
                    index.direct_by_district.setdefault(district, []).append(code)

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


def wards_of(lb_code: str, cycle: int) -> GeoSlice:
    """One body's ward polygons, for a cycle that has ward geometry."""
    path = _resolve(WARD_LAYER.get(cycle), "ward", cycle)

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


def local_bodies_of(district: str, cycle: int) -> GeoSlice:
    """The Grama Panchayat, Municipality and Corporation polygons of one district."""
    path = _resolve(LOCAL_BODY_LAYER.get(cycle), "local body", cycle)

    def build() -> GeoSlice:
        index = _index_for(path)
        codes = index.direct_by_district.get(district, [])
        ranges = [span for code in codes for span in index.by_code.get(code, [])]
        features = _read_features(path, ranges)
        return _collection(
            [_simplified_feature(feature, BODY_TOLERANCE) for feature in features],
            index.provenance,
            level="local_body",
            cycle=cycle,
            district_name=district,
            key_property="lb_code",
        )

    return _cached(("bodies", str(path), district, cycle), build)


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
