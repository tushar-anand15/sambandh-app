#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DUMP_FILE="${1:-$PROJECT_DIR/sambandh.dump}"

cd "$PROJECT_DIR"

if [ ! -f "$DUMP_FILE" ]; then
    echo "Error: Dump file not found: $DUMP_FILE"
    exit 1
fi

echo "Starting database container..."
docker compose up -d db

echo "Waiting for database to be ready..."
until docker compose exec -T db pg_isready -U sambandh > /dev/null 2>&1; do
    echo "  Waiting..."
    sleep 2
done
echo "Database is ready."

echo "Restoring database from $DUMP_FILE..."
docker compose exec -T db pg_restore -U sambandh -d sambandh -F c --no-owner --clean --if-exists < "$DUMP_FILE" || true

echo "Database restored successfully from $DUMP_FILE"
