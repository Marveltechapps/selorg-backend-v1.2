#!/usr/bin/env bash
# Patch EC2 backend.env Worldline redirect targets and recreate the API container.
# Run on the API host (ubuntu@api.selorg.com):
#   bash scripts/fix-aws-worldline-redirect-env.sh
# Or from the deploy home:
#   bash /home/ubuntu/selorg/selorg-backend-v1.2/scripts/fix-aws-worldline-redirect-env.sh

set -euo pipefail

ENV_FILE="${ENV_FILE:-/home/ubuntu/selorg/envs/backend.env}"
CONTAINER_NAME="${CONTAINER_NAME:-selorg-backend}"
IMAGE_NAME="${IMAGE_NAME:-selorg-backend:latest}"
NETWORK_NAME="${NETWORK_NAME:-selorg-net}"
HOST_PORT="${HOST_PORT:-5000}"

upsert_env() {
  local key="$1"
  local val="$2"
  if [[ ! -f "$ENV_FILE" ]]; then
    mkdir -p "$(dirname "$ENV_FILE")"
    touch "$ENV_FILE"
  fi
  if grep -qE "^${key}=" "$ENV_FILE"; then
    # portable in-place replace
    sed -i.bak -E "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

echo "Updating $ENV_FILE"
upsert_env NODE_ENV production
upsert_env WORLDLINE_WEB_APP_URL https://www.selorg.com
upsert_env CUSTOMER_WEB_URL https://www.selorg.com
upsert_env FRONTEND_URL https://www.selorg.com

echo "--- Worldline / NODE_ENV lines ---"
grep -E '^(NODE_ENV|WORLDLINE_WEB_APP_URL|CUSTOMER_WEB_URL|FRONTEND_URL|WORLDLINE_RETURN_URL)=' "$ENV_FILE" || true

if ! sudo docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "Image $IMAGE_NAME not found — env file updated, but container was not recreated."
  echo "Redeploy the backend or start the container manually with --env-file $ENV_FILE"
  exit 0
fi

echo "Recreating container $CONTAINER_NAME"
sudo docker stop "$CONTAINER_NAME" || true
sudo docker rm "$CONTAINER_NAME" || true

sudo docker run -d \
  --name "$CONTAINER_NAME" \
  --restart always \
  --network "$NETWORK_NAME" \
  -p "127.0.0.1:${HOST_PORT}:5000" \
  --env-file "$ENV_FILE" \
  -e NODE_ENV=production \
  -e WORLDLINE_WEB_APP_URL=https://www.selorg.com \
  -e CUSTOMER_WEB_URL=https://www.selorg.com \
  -e FRONTEND_URL=https://www.selorg.com \
  "$IMAGE_NAME"

echo "Waiting for health..."
sleep 8
curl -fsS "http://127.0.0.1:${HOST_PORT}/health" >/dev/null
echo "Health OK"

echo "Verify cancel redirect (should NOT contain localhost):"
curl -sI "https://api.selorg.com/api/v1/customer/payments/worldline/return" | tr -d '\r' | grep -i '^Location:' || true
