#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DUMP_FILE="${1:-$PROJECT_DIR/sambandh.dump}"

cd "$PROJECT_DIR"

echo "Dumping database to $DUMP_FILE..."
docker compose exec -T db pg_dump -U sambandh -F c sambandh > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "Database dumped successfully to $DUMP_FILE ($DUMP_SIZE)"
