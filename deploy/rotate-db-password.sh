#!/usr/bin/env bash
#
# Sets the Postgres role's password to the value in Secret Manager.
#
# Why this exists as a separate step rather than as part of a deploy.
#
# `POSTGRES_PASSWORD` in a compose file is read by the postgres image's
# entrypoint on **initdb only** — the first time a data directory is created.
# `gramsambandh_pgdata` was initialised long ago with the password `sambandh`,
# so setting POSTGRES_PASSWORD to anything else changes what the *backend* is
# told to connect with and does not change what the *database* accepts. The
# result is a backend that cannot authenticate against a database that is
# perfectly healthy, which reads at first glance like a database problem.
#
# That is the state right now: Secret Manager holds a 43-character password and
# the volume knows `sambandh`. The two have to be reconciled, and the order
# matters, because between the ALTER and the deploy the currently-running
# backend is holding an .env with the old password. Its existing pooled
# connections survive — libpq does not re-authenticate an open connection — but
# any reconnect fails, so the site degrades from the moment this runs until the
# new containers are up. That window is the reason this is not folded into
# deploy.sh: it should be a thing someone starts deliberately and follows
# immediately with a deploy, not a thing that happens as a side effect.
#
#   ./backup-db.sh manual          # first. this changes an access credential
#   ./rotate-db-password.sh        # this script. site degrades from here
#   ./deploy.sh <sha>              # immediately. site recovers here
#
# Rolling back: this script is idempotent and reversible — run it again with
# PASSWORD=sambandh in the environment to put the old value back if the deploy
# that was supposed to follow it cannot be made to work.

set -euo pipefail

PROJECT="${GCP_PROJECT:-sulekhasakarma-495616}"
SECRET="${SECRET_NAME:-gramsambandh-postgres-password}"

log() { printf '\n[rotate] %s\n' "$*"; }

# --- refuse without a backup ----------------------------------------------

if ! sudo test -f /srv/gramsambandh/last_backup; then
  echo "[rotate] FATAL: no backup recorded. Run ./backup-db.sh manual first." >&2
  exit 1
fi
log "Most recent backup: $(sudo cat /srv/gramsambandh/last_backup)"

# --- the new password -----------------------------------------------------

if [[ -n "${PASSWORD:-}" ]]; then
  # The documented escape hatch: PASSWORD=sambandh to undo.
  log "Using PASSWORD from the environment rather than Secret Manager"
  NEW="$PASSWORD"
else
  NEW="$(gcloud secrets versions access latest --secret="$SECRET" --project="$PROJECT")"
  log "Read ${SECRET} (${#NEW} characters)"
fi
[[ -n "$NEW" ]] || { echo "[rotate] FATAL: empty password." >&2; exit 1; }

CID="$(sudo docker ps --filter name=db --filter status=running --format '{{.ID}}' | head -1)"
[[ -n "$CID" ]] || { echo "[rotate] FATAL: no running db container." >&2; exit 1; }

# --- alter ----------------------------------------------------------------
#
# Passed as a parameter, not interpolated into the SQL text. ALTER USER cannot
# take a bound parameter for a password, so this uses psql's own variable
# quoting (:'v'), which escapes the value rather than pasting it. A generated
# password containing a quote would otherwise be a syntax error at best.
#
# Piped in rather than passed with -c so the password never appears in the
# process list, where `ps` on a shared machine would show it.

log "Setting the password for role 'sambandh'"
printf "\\set v %s\nALTER USER sambandh WITH PASSWORD :'v';\n" "$(printf '%q' "$NEW")" \
  | sudo docker exec -i "$CID" psql -U sambandh -d sambandh -q -v ON_ERROR_STOP=1

# --- verify ---------------------------------------------------------------
#
# Proves the new password authenticates, rather than trusting that the ALTER
# reported success. Connects over TCP to force real authentication: a local
# socket connection as the container's own user would pass under `trust` or
# `peer` and prove nothing about the password.

log "Verifying the new password authenticates"
if sudo docker exec -e PGPASSWORD="$NEW" -i "$CID" \
     psql -h 127.0.0.1 -U sambandh -d sambandh -tAc 'SELECT 1' >/dev/null 2>&1; then
  log "Rotated. Deploy now — the running backend still holds the old password."
else
  echo "[rotate] FATAL: the new password does not authenticate." >&2
  echo "The database may now accept neither password. Restore from the backup" >&2
  echo "above by the procedure in docs/deployment_runbook.md." >&2
  exit 1
fi
