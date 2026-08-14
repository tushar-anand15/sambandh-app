#!/usr/bin/env bash
#
# Puts the boundary layers on the VM. Run by deploy.sh on every deploy, and
# safe to run by hand.
#
# There are 104 MB of these across six files, the largest of which
# (wards_2025.geojson) is 57 MB on its own. They are not in the repository and
# they are not in the backend image, for the same reason: they are built by
# sulekha's `geo build` on sulekha's schedule, and neither a git history nor a
# container image should carry a 57 MB derived artefact that changes on a
# different clock from the thing carrying it.
#
# So they live in gs://sulekhasakarma-geo/layers, and this syncs them down to a
# host directory that docker-compose.prod.yml bind-mounts read-only at
# /srv/geo. Publishing a new set of layers is `gcloud storage rsync` up to that
# bucket followed by this script — no rebuild, no redeploy.
#
# The VM's service account reads them with roles/storage.objectViewer on that
# bucket. Nothing else needs access.

set -euo pipefail

PROJECT=sulekhasakarma-495616
BUCKET=gs://sulekhasakarma-geo/layers
GEO_DIR=/srv/gramsambandh/geo

sudo mkdir -p "$GEO_DIR"
sudo chown "$(id -u):$(id -g)" "$GEO_DIR"

echo "=== Syncing boundary layers from ${BUCKET}"

if gcloud storage rsync "$BUCKET" "$GEO_DIR" --delete-unmatched-destination-objects --project="$PROJECT"; then
  echo "Layers present: $(find "$GEO_DIR" -name '*.geojson' | wc -l) file(s), $(du -sh "$GEO_DIR" | cut -f1)"
  exit 0
fi

# A sync failure is not automatically a deploy failure. The application treats
# a missing layer as a stated absence rather than an error — /api/maps reports
# each layer's status and /geo/{file} answers with the reason — so a site with
# stale-but-present layers is worth keeping up. A site with none is not: every
# map on it would be blank, which is worse than a failed deploy.
if find "$GEO_DIR" -name '*.geojson' | grep -q .; then
  echo "WARNING: sync failed; keeping the layers already on disk." >&2
  exit 0
fi

echo "FATAL: sync failed and there are no layers on disk. Every map would be blank." >&2
exit 1
