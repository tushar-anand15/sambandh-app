#!/bin/bash
set -e

DOMAIN="gramsambandh.co.in"
EMAIL="${1:-admin@gramsambandh.co.in}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "Step 1: Creating certbot directories..."
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.ssl.yml up -d frontend

echo "Step 2: Obtaining SSL certificate..."
sudo docker run --rm \
  -v sambandh-app_certbot-webroot:/var/www/certbot \
  -v sambandh-app_certbot-certs:/etc/letsencrypt \
  certbot/certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

echo "Step 3: Restarting frontend with SSL..."
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.ssl.yml up -d --force-recreate frontend

echo "Step 4: Starting certbot renewal service..."
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.ssl.yml up -d certbot

echo ""
echo "SSL setup complete!"
echo "Your site is now available at: https://$DOMAIN"
