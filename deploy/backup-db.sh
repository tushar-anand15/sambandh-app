#!/usr/bin/env bash
#
# Dumps the production database to GCS.
#
# What is actually at stake here, because it is not the obvious thing. The
# public data on this site — finances, meetings, elections, boundaries — is
# derived. It is rebuilt from the sulekha repository against sources that are
# still published, so losing it costs a rebuild. `chunk_embeddings` is not
# derived in that sense: 99,616 vectors produced by bge-m3 over 1,055 scanned
# documents, and the machine that produced them is being retired for one with
# no GPU and no pytorch in the image. Losing that table does not cost a rebuild,
# it costs a re-embedding run that this deployment can no longer perform.
#
# Until this script existed those vectors lived in exactly one Docker volume on
# one e2-small, with no dump and no disk snapshot behind them.
#
# Two independent recovery paths, because they fail differently:
#
#   this script          logical, portable, restores into any pg16+pgvector,
#                        survives the VM being deleted, and is what you want
#                        after a bad migration
#   the disk snapshot    physical, whole-machine, no pg_dump load on the box,
#                        and is what you want after the disk is corrupt
#                        (see deployment_runbook.md for the schedule)
#
# A dump nobody has restored is a hypothesis, not a backup, so this verifies
# what it wrote before it reports success — see `verify` below.

set -euo pipefail

PROJECT="${GCP_PROJECT:-sulekhasakarma-495616}"
BUCKET="${BACKUP_BUCKET:-gs://gramsambandh-db-backups}"
# `scheduled` from cron, `pre-deploy` from deploy.sh, `manual` by hand. Kept in
# separate prefixes so that the retention sweep at the end can be told to leave
# the pre-deploy ones alone: those are the ones you go looking for precisely
# when something has gone wrong and time has passed.
KIND="${1:-manual}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="/var/tmp/sambandh-${STAMP}.dump"
DEST="${BUCKET}/${KIND}/sambandh-${STAMP}.dump"

# /var/tmp, not /tmp and not /dev/shm. The dump is around 800 MB and this
# machine has under 2 GB of RAM: writing it to a tmpfs would push Postgres into
# swap while it is being read from.
cleanup() { rm -f "$DUMP"; }
trap cleanup EXIT

log() { printf '[backup] %s\n' "$*"; }

CID="$(sudo docker ps --filter name=db --filter status=running --format '{{.ID}}' | head -1)"
if [[ -z "$CID" ]]; then
  echo "[backup] FATAL: no running db container. Nothing was backed up." >&2
  exit 1
fi

# --- dump -----------------------------------------------------------------
#
# -Fc so it can be restored selectively and out of order: after a bad migration
# what you usually want is one table back, not the whole database. Plain SQL
# cannot do that.
#
# Read-only, and takes no lock that blocks a reader or a writer of existing
# rows, so this is safe to run against the live site. It does hold back vacuum
# for its duration, which on a database this size is minutes, not hours.
log "Dumping from container ${CID}"
sudo docker exec "$CID" pg_dump -U sambandh -d sambandh -Fc --compress=6 > "$DUMP"
SIZE="$(du -h "$DUMP" | cut -f1)"
log "Wrote ${SIZE}"

# --- verify ---------------------------------------------------------------
#
# The failure this catches is a truncated or empty dump reported as a success,
# which is what a full disk or an OOM-killed pg_dump produces. `pg_restore
# --list` parses the archive's table of contents and fails on a corrupt file,
# and the grep insists the one irreplaceable table is actually in there rather
# than trusting that a well-formed archive is a complete one.
log "Verifying the archive"
TOC="$(sudo docker exec -i "$CID" pg_restore --list < "$DUMP")" || {
  echo "[backup] FATAL: the dump is not a readable archive. Not uploading." >&2
  exit 1
}
for table in chunk_embeddings processed_chunks documents users; do
  grep -q "TABLE DATA public ${table}" <<<"$TOC" || {
    echo "[backup] FATAL: ${table} is missing from the dump. Not uploading." >&2
    exit 1
  }
done
log "Archive contains the embedding tables"

# --- upload ---------------------------------------------------------------
#
# The bucket has object versioning on, so an upload can add but never destroy:
# a corrupt dump written over a good one at the same path leaves the good one
# recoverable as a noncurrent version.
log "Uploading to ${DEST}"
gcloud storage cp "$DUMP" "$DEST" --project "$PROJECT"

# --- retention ------------------------------------------------------------
#
# Only ever prunes `scheduled/`. pre-deploy and manual dumps are kept until
# someone decides otherwise, because they are small in number and are taken at
# exactly the moments worth being able to return to.
if [[ "$KIND" == "scheduled" ]]; then
  KEEP=14
  mapfile -t OLD < <(
    gcloud storage ls "${BUCKET}/scheduled/" --project "$PROJECT" 2>/dev/null \
      | sort | head -n -"$KEEP"
  )
  if (( ${#OLD[@]} > 0 )); then
    log "Removing ${#OLD[@]} dump(s) older than the last ${KEEP}"
    printf '%s\n' "${OLD[@]}" | xargs -r gcloud storage rm --project "$PROJECT"
  fi
fi

# Where the last good dump went. deploy.sh reads this so that its rollback
# message can name the exact object to restore rather than telling an operator
# to go and find it, and a monitoring check can read the mtime to notice that
# the scheduled backup stopped running.
sudo mkdir -p /srv/gramsambandh
printf '%s\n' "$DEST" | sudo tee /srv/gramsambandh/last_backup >/dev/null

log "Done: ${DEST} (${SIZE})"
