"""Where the boundary layers live on disk, and whether each one is there.

The seven layers `sulekha`'s `geo build` emits are between 7.5 MB and 57 MB.
Nothing that size belongs in a git repository, so the files are a deployment
input: mount the directory that holds them and set `GEO_DIR`.

Two calls, used by two routers. `/api/maps` asks `layer_status` so the
inventory can state which layers this server actually holds, and `/geo/{file}`
asks `layer_path` so a request for a file that is not there answers with the
reason rather than an empty body.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

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
NO_DIRECTORY = (
    "This server has no boundary layer directory configured, so no layer file "
    "is served. The layers are built by sulekha's geo build; a deployment "
    "mounts them and sets GEO_DIR."
)
NOT_ON_SERVER = (
    "This layer is not in the boundary layer directory this server was given. "
    "It is emitted by sulekha's geo build and has to be copied into that "
    "directory before it can be downloaded."
)


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
