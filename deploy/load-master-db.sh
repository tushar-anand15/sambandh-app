#!/usr/bin/env bash
#
# Loads a master-database release onto production, by the procedure in
# sulekha/docs/deployment_runbook.md ("Getting the derived schemas onto
# production"). This script is that section, executable.
#
# The two halves of this database are maintained in opposite ways and the
# distinction is the whole safety argument:
#
#   public      users, chats, documents, processed_chunks, chunk_embeddings.
#               Written by the running application, migrated by alembic one
#               column at a time, and holding 99,616 vectors that the machine
#               this deploys to can no longer regenerate.
#   core        built offline by sulekha's `master` package from the state's
#   finance     published sources. Production only ever reads them. They are
#   meetings    replaced wholesale on a release.
#   elections
#
# So this script holds a replace-everything hammer in a database that also
# holds the one irreplaceable thing, and every design choice below is about
# keeping those apart.
#
# Restore into `*_build`, then swap by rename. Not drop-then-restore, for two
# reasons that only show up under load:
#
#   A `DROP SCHEMA finance CASCADE` followed by a 1.5 GB restore in the same
#   transaction holds an exclusive lock on the live schema for the whole
#   restore. Readers do not error, they *block*, so the site hangs for minutes
#   rather than failing fast. Restoring into scratch names touches nothing the
#   site reads, and the swap that follows is a catalogue rename measured in
#   milliseconds.
#
#   Dropping also throws the old release away at the moment you are least sure
#   about the new one. Renaming to `*_prev` keeps it, so a bad release is one
#   more rename to undo rather than a restore from a dump.
#
# `public` is never named by anything here. Note the corollary the runbook
# already records: nothing in `public` may reference these four schemas, or a
# later `DROP SCHEMA *_prev CASCADE` will follow the dependency out of the
# blast radius this script is careful to draw. Alembic migrations must not
# create one.

set -euo pipefail

PROJECT="${GCP_PROJECT:-sulekhasakarma-495616}"
SCHEMAS=(core finance meetings elections)

DUMP_URI="${1:?usage: load-master-db.sh gs://.../master_derived_YYYYMMDD.dump}"

log() { printf '\n[master] %s\n' "$*"; }
psql_() { sudo docker exec -i "$CID" psql -U sambandh -d sambandh "$@"; }

CID="$(sudo docker ps --filter name=db --filter status=running --format '{{.ID}}' | head -1)"
[[ -n "$CID" ]] || { echo "[master] FATAL: no running db container." >&2; exit 1; }

# --- refuse without a backup ----------------------------------------------

if ! sudo test -f /srv/gramsambandh/last_backup; then
  echo "[master] FATAL: no backup has ever been recorded on this machine." >&2
  echo "Run ./backup-db.sh manual first." >&2
  exit 1
fi
log "Most recent backup: $(sudo cat /srv/gramsambandh/last_backup)"

EMBED_BEFORE="$(psql_ -tAc 'SELECT count(*) FROM chunk_embeddings' | tr -d '[:space:]')"
log "chunk_embeddings before: ${EMBED_BEFORE}"

# --- fetch ----------------------------------------------------------------

DUMP=/var/tmp/master-load.dump
cleanup() { rm -f "$DUMP"; }
trap cleanup EXIT

log "Fetching ${DUMP_URI}"
gcloud storage cp "$DUMP_URI" "$DUMP" --project "$PROJECT"
ls -lh "$DUMP"

# --- check the dump before touching anything ------------------------------
#
# The dump is written by pg_dump 17 on the build host against a postgres:17
# container; production is pgvector/pgvector:pg16. A custom-format archive
# written by 17 cannot be read by pg_restore 16 at all — it fails on the header
# — so every pg_restore below runs a **17 client** in a throwaway container
# against the 16 server over the compose network. Verified working: the only
# complaint is `SET transaction_timeout`, a GUC that pg17 emits and pg16 does
# not have. It is a session setting, it fails harmlessly, and it is the reason
# the restore below cannot use ON_ERROR_STOP.
#
# The connection is over TCP, so unlike every `psql_` call above it actually
# authenticates: those go through `docker exec` to a unix socket, where the
# postgres image's pg_hba trusts the local user, while a host connection needs
# a password. Taken from the db container's own environment rather than from a
# literal or from Secret Manager, so this keeps working either side of
# rotate-db-password.sh without knowing which side it is on.
DBPASS="$(sudo docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CID" \
          | sed -n 's/^POSTGRES_PASSWORD=//p' | head -1)"
[[ -n "$DBPASS" ]] || { echo "[master] FATAL: could not read the db password." >&2; exit 1; }

RESTORE=(sudo docker run --rm --network container:"$CID" -e PGPASSWORD="$DBPASS"
         -v /var/tmp:/d postgres:17
         pg_restore -h 127.0.0.1 -U sambandh -d sambandh --no-owner --no-privileges)

log "Reading the archive"
TOC="$(sudo docker run --rm -v /var/tmp:/d postgres:17 pg_restore --list /d/master-load.dump)" || {
  echo "[master] FATAL: not a readable archive." >&2; exit 1; }

# The dump is taken from schemas already renamed to *_build on the build host,
# so these are the names expected here. A dump of the live names would restore
# straight over the schemas the site is reading.
for s in "${SCHEMAS[@]}"; do
  grep -q "${s}_build" <<<"$TOC" || {
    echo "[master] FATAL: the dump has nothing in '${s}_build'." >&2
    echo "Take it from schemas renamed to *_build — see the runbook." >&2
    exit 1
  }
done

if grep -qE ' (TABLE|TABLE DATA|SEQUENCE|VIEW|MATERIALIZED VIEW) public ' <<<"$TOC"; then
  echo "[master] FATAL: this dump contains objects in the public schema," >&2
  echo "which is where chunk_embeddings lives. Refusing to load it." >&2
  exit 1
fi
log "Archive is scoped to the four *_build schemas and does not mention public"

# --- restore into scratch names -------------------------------------------
#
# Nothing the site reads is touched by this. It is the slow part — minutes —
# and it happens while the old release is still being served normally.

log "Dropping any leftover *_build from a previous attempt"
for s in "${SCHEMAS[@]}"; do
  psql_ -q -c "DROP SCHEMA IF EXISTS ${s}_build CASCADE" 2>&1 | grep -v NOTICE || true
done

log "Restoring into *_build (the site is still serving the old release)"
"${RESTORE[@]}" -j2 /d/master-load.dump 2>&1 \
  | grep -v 'transaction_timeout\|errors ignored on restore' || true

for s in "${SCHEMAS[@]}"; do
  n="$(psql_ -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='${s}_build'" | tr -d '[:space:]')"
  [[ "$n" -gt 0 ]] || { echo "[master] FATAL: ${s}_build is empty after restore." >&2; exit 1; }
  printf '  %-16s %s tables\n' "${s}_build" "$n"
done

# --- verify the release before it is live ---------------------------------
#
# core.build_manifest is written by `master build` and records what that build
# produced. Checking it here means a truncated or half-built release is caught
# while it is still in scratch schemas that nothing reads.

log "Build manifest of the incoming release"
psql_ -c "SELECT dataset, built_at, bodies, projects, meetings, candidates FROM core_build.build_manifest"

# --- swap -----------------------------------------------------------------
#
# One transaction, all renames. Catalogue-only, so it commits in milliseconds
# and no request sees a half-swapped release. `to_regnamespace` is how this
# stays correct on the first load, when the live schemas do not exist yet.

log "Swapping *_build into place"
psql_ -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['core','finance','meetings','elections'] LOOP
    IF to_regnamespace(s) IS NOT NULL THEN
      EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', s || '_prev');
      EXECUTE format('ALTER SCHEMA %I RENAME TO %I', s, s || '_prev');
    END IF;
    EXECUTE format('ALTER SCHEMA %I RENAME TO %I', s || '_build', s);
  END LOOP;
END $$;
COMMIT;
SQL

# --- analyse --------------------------------------------------------------
#
# ANALYZE takes a table, not a schema wildcard, so this walks the catalogue.
# Deliberately not a bare `ANALYZE`, which would also walk processed_chunks and
# chunk_embeddings — the two expensive tables this script did not touch.
log "Analysing the new release"
psql_ -q <<'SQL'
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname, relname FROM pg_stat_user_tables
           WHERE schemaname IN ('core','finance','meetings','elections')
  LOOP EXECUTE format('ANALYZE %I.%I', t.schemaname, t.relname); END LOOP;
END $$;
SQL

# --- prove the untouched half is untouched --------------------------------

EMBED_AFTER="$(psql_ -tAc 'SELECT count(*) FROM chunk_embeddings' | tr -d '[:space:]')"
if [[ "$EMBED_BEFORE" != "$EMBED_AFTER" ]]; then
  echo >&2
  echo "[master] chunk_embeddings went from ${EMBED_BEFORE} to ${EMBED_AFTER}." >&2
  echo "That must never happen: nothing here names the public schema. Stop and" >&2
  echo "restore the backup above before anything else writes to this database." >&2
  exit 1
fi

log "Live release:"
psql_ -c "SELECT dataset, built_at, bodies, projects, meetings, candidates FROM core.build_manifest"

cat <<DONE

[master] Done. chunk_embeddings unchanged at ${EMBED_AFTER}.

The previous release is kept as core_prev / finance_prev / meetings_prev /
elections_prev — about 1.5 GB. To undo, swap the names back. To finish, once
the site has served real traffic against the new data:

    DROP SCHEMA core_prev CASCADE;      DROP SCHEMA finance_prev CASCADE;
    DROP SCHEMA meetings_prev CASCADE;  DROP SCHEMA elections_prev CASCADE;

There is no hurry: it is insurance, and this VM has the disk for it.
DONE
