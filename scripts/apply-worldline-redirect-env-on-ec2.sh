#!/usr/bin/env bash
# One-shot EC2 fix (no git pull required). Paste on api.selorg.com / ubuntu host.
# Fixes Paynimo cancel redirect: localhost:5173 → https://www.selorg.com

set -euo pipefail
ENV_FILE=/home/ubuntu/selorg/envs/backend.env
CONTAINER=selorg-backend
IMAGE=selorg-backend:latest

mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"

upsert() {
  local k="$1" v="$2"
  if grep -qE "^${k}=" "$ENV_FILE"; then
    sed -i -E "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
  else
    echo "${k}=${v}" >> "$ENV_FILE"
  fi
}

upsert NODE_ENV production
upsert WORLDLINE_WEB_APP_URL https://www.selorg.com
upsert CUSTOMER_WEB_URL https://www.selorg.com
upsert FRONTEND_URL https://www.selorg.com

grep -E '^(NODE_ENV|WORLDLINE_WEB_APP_URL|CUSTOMER_WEB_URL|FRONTEND_URL)=' "$ENV_FILE"

sudo docker stop "$CONTAINER" || true
sudo docker rm "$CONTAINER" || true
sudo docker run -d \
  --name "$CONTAINER" \
  --restart always \
  --network selorg-net \
  -p 127.0.0.1:5000:5000 \
  --env-file "$ENV_FILE" \
  -e NODE_ENV=production \
  -e WORLDLINE_WEB_APP_URL=https://www.selorg.com \
  -e CUSTOMER_WEB_URL=https://www.selorg.com \
  -e FRONTEND_URL=https://www.selorg.com \
  "$IMAGE"

sleep 8
curl -fsS http://127.0.0.1:5000/health
echo
echo "Cancel Location header (must NOT contain localhost):"
curl -sI https://api.selorg.com/api/v1/customer/payments/worldline/return | tr -d '\r' | grep -i '^Location:'
