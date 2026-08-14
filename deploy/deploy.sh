#!/usr/bin/env bash
#
# Runs on the production VM. Takes one argument: the commit SHA whose images are
# to be served. Everything it needs is either in this directory or in Google
# Cloud, and it never reads a git repository, because there is not one here.
#
# The shape of a deploy:
#
#   pull the two images by tag  ->  if either is missing, nothing has changed yet
#   fetch secrets to tmpfs      ->  if any is missing, compose refuses to start
#   compose up                  ->  containers are replaced
#   health check                ->  if it fails, the previous tag is brought back
#
# The ordering is the safety property. Both images are pulled before any
# container is touched, so a bad tag or an expired token fails while the site is
# still serving the old build. After that point failure is recoverable rather
# than avoidable, which is what the rollback at the end is for.
#
# Rolling back is not a special path: it is this same script run with an earlier
# SHA. That is the whole reason images are tagged by commit and never `latest` —
# `latest` cannot name the thing you want to go back to.

set -euo pipefail

SHA="${1:?usage: deploy.sh <git-sha>}"

PROJECT=sulekhasakarma-495616
REGION=asia-south1
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/gramsambandh"
STATE_DIR=/srv/gramsambandh
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Docker on this VM is root-only: the startup script added a user named
# `tusharanand` to the docker group and no such user was ever created. Rather
# than depend on that being fixed, everything that talks to the daemon goes
# through sudo, which the deploy identity has via roles/compute.osAdminLogin.
DOCKER="sudo docker"

# tmpfs. The secrets exist as a file for the length of one `compose up` and are
# never written to the disk image or to a snapshot of it.
ENV_FILE="/dev/shm/gramsambandh-deploy.$$.env"
cleanup() { rm -f "$ENV_FILE"; }
trap cleanup EXIT

log() { printf '\n=== %s\n' "$*"; }

# ---------------------------------------------------------------------------

log "Deploying ${SHA}"

sudo mkdir -p "$STATE_DIR"
PREVIOUS=""
if sudo test -f "${STATE_DIR}/current_sha"; then
  PREVIOUS="$(sudo cat "${STATE_DIR}/current_sha")"
fi
log "Currently serving: ${PREVIOUS:-<unknown: no previous deploy recorded>}"

# --- registry -------------------------------------------------------------

# A short-lived token rather than `gcloud auth configure-docker`, because the
# daemon is being driven as root and the credential helper would look for a
# config in the calling user's home. The token is valid for an hour and is not
# written anywhere.
log "Authenticating to Artifact Registry"
gcloud auth print-access-token \
  | $DOCKER login -u oauth2accesstoken --password-stdin "https://${REGION}-docker.pkg.dev"

# --- pull -----------------------------------------------------------------
#
# Before anything is stopped. A tag that was never pushed, or a token that
# cannot read the repository, ends the script here with the old build still up.

BACKEND_IMAGE="${REGISTRY}/backend:${SHA}"
FRONTEND_IMAGE="${REGISTRY}/frontend:${SHA}"

log "Pulling ${BACKEND_IMAGE}"
$DOCKER pull "$BACKEND_IMAGE"
log "Pulling ${FRONTEND_IMAGE}"
$DOCKER pull "$FRONTEND_IMAGE"

# --- boundary layers ------------------------------------------------------

"${DEPLOY_DIR}/sync-geo.sh"

# --- secrets --------------------------------------------------------------
#
# Read with the VM's own service account, through the metadata server. There is
# no key file on this machine and no credential in GitHub that can read these.

log "Fetching secrets from Secret Manager"
umask 077
: > "$ENV_FILE"

secret() {
  local var="$1" name="$2" value
  if ! value="$(gcloud secrets versions access latest --secret="$name" --project="$PROJECT" 2>/dev/null)"; then
    echo "FATAL: cannot read secret ${name}. Check that gramsambandh-vm@ has" >&2
    echo "roles/secretmanager.secretAccessor on it. Nothing has been changed." >&2
    exit 1
  fi
  printf '%s=%s\n' "$var" "$value" >> "$ENV_FILE"
}

secret JWT_SECRET        gramsambandh-jwt-secret
secret POSTGRES_PASSWORD gramsambandh-postgres-password
secret UMAMI_APP_SECRET  gramsambandh-umami-app-secret
secret LLM_API_KEY       gramsambandh-llm-api-key

# The non-secret half, from the repository.
cat "${DEPLOY_DIR}/prod.env" >> "$ENV_FILE"

# --- database ------------------------------------------------------------
#
# The backend's command is `alembic upgrade head && uvicorn`, so bringing the
# containers up is also what applies migrations. That makes this the last point
# in the script where the database is still untouched.
#
# The rollback at the bottom of this file rolls back *images*. It cannot roll
# back a schema, and it must not try: the initial migration's downgrade() drops
# chunk_embeddings, which is the one table in this database that cannot be
# rebuilt from source. So for a deploy that migrates, the recovery path is not
# "run the old images", it is "restore the dump and then run the old images",
# and that only works if the dump was taken.
#
# Taken conditionally rather than always, because the dump is ~800 MB from a
# 2 GB machine and adding five minutes to every routine deploy is how a safety
# step turns into a step someone removes. The condition is exact: compare the
# revision the database is stamped at against the head revision baked into the
# image being deployed. Equal means `upgrade head` has nothing to run and cannot
# touch the schema, so there is nothing to protect against. Anything else —
# including the database being at a revision this image has never heard of,
# which is what a rollback across a migration looks like — takes the backup.

# The nightly dump, installed from here rather than by hand on the VM. Written
# every deploy because it is the same three lines every time and because the
# alternative — a one-off someone ran once — is a thing that silently does not
# exist on a rebuilt machine. 19:30 UTC is an hour before the disk snapshot, so
# a snapshot never catches a dump mid-write.
log "Ensuring the nightly backup is scheduled"
sudo tee /etc/cron.d/gramsambandh-backup >/dev/null <<CRON
# Managed by deploy.sh. Edits here are overwritten on the next deploy.
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin:/snap/bin
30 19 * * * root ${DEPLOY_DIR}/backup-db.sh scheduled >> /var/log/gramsambandh-backup.log 2>&1
CRON
sudo chmod 0644 /etc/cron.d/gramsambandh-backup

log "Checking whether this deploy migrates the database"

DB_CID="$($DOCKER ps --filter name=db --filter status=running --format '{{.ID}}' | head -1)"
if [[ -z "$DB_CID" ]]; then
  echo "FATAL: no running db container. Refusing to deploy against a database" >&2
  echo "that is not up: the state before a migration could not be captured." >&2
  exit 1
fi

# `alembic heads` reads the versions directory only and never opens a
# connection, so this is safe to run in a throwaway container with no database
# and no secrets.
IMAGE_HEAD="$($DOCKER run --rm --entrypoint sh "$BACKEND_IMAGE" \
  -c 'cd /app && uv run alembic heads 2>/dev/null' | awk '{print $1}' | head -1)"
DB_REVISION="$($DOCKER exec "$DB_CID" psql -U sambandh -d sambandh -tAc \
  'SELECT version_num FROM alembic_version' 2>/dev/null | tr -d '[:space:]' || true)"

log "Database is at '${DB_REVISION:-<unstamped>}'; ${SHA} ships head '${IMAGE_HEAD:-<unknown>}'"

MIGRATES=yes
BACKUP=""
if [[ -z "$IMAGE_HEAD" ]]; then
  # Not fatal on its own, but it means the cheap check failed rather than
  # returned "no migration", and the safe reading of an unknown is that there
  # is one.
  log "Could not read the image's head revision. Backing up to be safe."
  "${DEPLOY_DIR}/backup-db.sh" pre-deploy
elif [[ "$DB_REVISION" == "$IMAGE_HEAD" ]]; then
  MIGRATES=no
  log "No migration to apply. Skipping the pre-deploy backup."
else
  log "This deploy changes the schema. Backing up first."
  if ! "${DEPLOY_DIR}/backup-db.sh" pre-deploy; then
    echo "FATAL: the pre-deploy backup failed, and this deploy would migrate" >&2
    echo "the database from '${DB_REVISION:-<unstamped>}' to '${IMAGE_HEAD}'." >&2
    echo "Nothing has been changed. Fix the backup before deploying this." >&2
    exit 1
  fi
fi

if [[ "$MIGRATES" == "yes" ]] && sudo test -f "${STATE_DIR}/last_backup"; then
  BACKUP="$(sudo cat "${STATE_DIR}/last_backup")"
fi

# --- bring up -------------------------------------------------------------

compose_up() {
  local sha="$1"
  BACKEND_IMAGE="${REGISTRY}/backend:${sha}" \
  FRONTEND_IMAGE="${REGISTRY}/frontend:${sha}" \
  $DOCKER compose \
    --project-directory "$DEPLOY_DIR" \
    -f "${DEPLOY_DIR}/docker-compose.prod.yml" \
    --env-file "$ENV_FILE" \
    up -d --remove-orphans
}

# Waits for the thing a user would notice, not for the container to exist.
#
#   /health on the backend runs a query, so it is false while migrations are
#   still running and false if the pool cannot reach the database.
#   /health through nginx proves TLS terminated and the static build is served.
#   /api/bodies proves nginx's proxy to the backend actually resolves, which is
#   the pairing that breaks when one of the two images is from a different
#   commit than the other.
#
# 90 seconds. `alembic upgrade head` plus uvicorn start is a few seconds on a
# no-op migration; the budget is for the case where it is not a no-op.
health_check() {
  local deadline=$((SECONDS + 90))
  local last=""
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 5 http://127.0.0.1:8000/health >/dev/null 2>&1 \
    && curl -fsSk --max-time 5 -H 'Host: gramsambandh.co.in' \
         https://127.0.0.1/health >/dev/null 2>&1 \
    && curl -fsSk --max-time 15 -H 'Host: gramsambandh.co.in' \
         -o /dev/null https://127.0.0.1/api/bodies 2>&1; then
      return 0
    fi
    last="$(date -u +%H:%M:%S)"
    sleep 3
  done
  echo "Health check did not pass within 90s (last attempt ${last})." >&2
  return 1
}

log "Starting containers on ${SHA}"
compose_up "$SHA"

log "Health check"
if health_check; then
  echo "$SHA" | sudo tee "${STATE_DIR}/current_sha" >/dev/null
  log "Deployed ${SHA}"
  $DOCKER image prune -f >/dev/null
  exit 0
fi

# --- rollback -------------------------------------------------------------

log "DEPLOY FAILED — recent backend logs"
$DOCKER compose --project-directory "$DEPLOY_DIR" \
  -f "${DEPLOY_DIR}/docker-compose.prod.yml" --env-file "$ENV_FILE" \
  logs --tail=60 backend frontend || true

if [[ -z "$PREVIOUS" ]]; then
  echo "FATAL: no previous SHA recorded, so there is nothing to roll back to." >&2
  echo "The site is down on ${SHA}. Pick a tag from:" >&2
  echo "  gcloud artifacts docker tags list ${REGISTRY}/backend --project=${PROJECT}" >&2
  echo "and run: $0 <that-sha>" >&2
  exit 1
fi

if [[ "$MIGRATES" == "yes" ]]; then
  cat >&2 <<WARN

  ---------------------------------------------------------------------------
  This deploy applied a migration, so rolling back the images does not restore
  the database. ${PREVIOUS} is about to run against the schema ${SHA} left
  behind. That is frequently fine — an added column or table is invisible to
  code that does not select it — and it is not fine when the migration renamed
  or dropped something the old code reads.

  If the rollback below comes up healthy, it is fine. If it does not, the
  database is the reason, and the recovery is to restore the dump taken a few
  minutes ago:

      ${BACKUP:-gs://gramsambandh-db-backups/pre-deploy/  (see the newest object)}

  by the procedure in docs/deployment_runbook.md. Do not reach for
  `alembic downgrade` — the first migration's downgrade() drops
  chunk_embeddings, which is 99,616 vectors that cannot be regenerated here.
  ---------------------------------------------------------------------------

WARN
fi

log "Rolling back to ${PREVIOUS}"
if $DOCKER pull "${REGISTRY}/backend:${PREVIOUS}" && $DOCKER pull "${REGISTRY}/frontend:${PREVIOUS}"; then
  compose_up "$PREVIOUS"
  if health_check; then
    log "Rolled back to ${PREVIOUS}. ${SHA} is not deployed."
    # current_sha is left as it was: PREVIOUS is what is serving.
    exit 1
  fi
  echo "FATAL: rollback to ${PREVIOUS} also failed its health check." >&2
else
  echo "FATAL: could not pull the previous images for ${PREVIOUS}." >&2
fi

echo "The site is not healthy and this script could not fix it. Intervene by hand." >&2
exit 1
