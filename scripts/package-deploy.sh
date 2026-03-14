#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_FILE="${1:-$PROJECT_DIR/sambandh-deploy.tar.gz}"

cd "$PROJECT_DIR"

echo "Step 1: Dumping database..."
./scripts/dump-db.sh

echo ""
echo "Step 2: Creating deployment package..."
tar --exclude='node_modules' \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='.git' \
    --exclude='*.pyc' \
    --exclude='.env.local' \
    --exclude='sambandh-deploy.tar.gz' \
    -czvf "$OUTPUT_FILE" \
    -C "$PROJECT_DIR" .

PACKAGE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
echo ""
echo "Deployment package created: $OUTPUT_FILE ($PACKAGE_SIZE)"
echo ""
echo "Next steps:"
echo "  1. Transfer to target: gcloud compute scp $OUTPUT_FILE <instance>:~ --zone=<zone>"
echo "  2. On target, extract and run:"
echo "     mkdir -p ~/sambandh-app && cd ~/sambandh-app"
echo "     tar -xzvf ~/sambandh-deploy.tar.gz"
echo "     ./scripts/restore-db.sh"
echo "     docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
