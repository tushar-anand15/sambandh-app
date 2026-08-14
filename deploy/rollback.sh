#!/usr/bin/env bash
#
# Go back to a previous build, by hand, from the VM.
#
#   ./rollback.sh                 # the tag before the one now serving
#   ./rollback.sh <sha>           # a specific tag
#   ./rollback.sh --list          # what is available to go back to
#
# There is no separate rollback mechanism, and that is the design: a rollback is
# a deploy of an earlier image tag, run through exactly the same script, with
# exactly the same health check deciding whether it worked. Anything else would
# be a code path that only ever runs during an incident, which is the worst
# possible time to find out it was wrong.
#
# deploy.sh already rolls back on its own when a deploy fails its health check.
# This is for the other case: the deploy passed, and the build turned out to be
# bad anyway.

set -euo pipefail

PROJECT=sulekhasakarma-495616
REGISTRY=asia-south1-docker.pkg.dev/${PROJECT}/gramsambandh
STATE_DIR=/srv/gramsambandh
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Tags newest first. The image is what a deploy names, so the registry is the
# authoritative list of what can be deployed — not the git log, which contains
# commits that were never built.
list_tags() {
  gcloud artifacts docker images list "${REGISTRY}/backend" \
    --project="$PROJECT" --include-tags --sort-by=~UPDATE_TIME \
    --format="table(TAGS,UPDATE_TIME.date('%Y-%m-%d %H:%M'))" --limit=20
}

if [[ "${1:-}" == "--list" ]]; then
  CURRENT="$(sudo cat "${STATE_DIR}/current_sha" 2>/dev/null || echo '<none recorded>')"
  echo "Currently serving: ${CURRENT}"
  echo
  list_tags
  exit 0
fi

TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  CURRENT="$(sudo cat "${STATE_DIR}/current_sha" 2>/dev/null || true)"
  # The most recent tag that is not the one running.
  TARGET="$(gcloud artifacts docker images list "${REGISTRY}/backend" \
      --project="$PROJECT" --include-tags --sort-by=~UPDATE_TIME \
      --format="value(TAGS)" --limit=10 \
    | tr ',' '\n' | grep -v '^$' | grep -vx "${CURRENT:-__none__}" | head -1)"

  if [[ -z "$TARGET" ]]; then
    echo "Could not work out a previous tag. Choose one yourself:" >&2
    list_tags >&2
    exit 1
  fi
  echo "Currently serving: ${CURRENT:-<none recorded>}"
  echo "Rolling back to:   ${TARGET}"
  read -r -p "Proceed? [y/N] " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || { echo "Aborted."; exit 1; }
fi

exec "${HERE}/deploy.sh" "$TARGET"
