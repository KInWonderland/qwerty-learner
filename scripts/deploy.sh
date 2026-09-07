#!/usr/bin/env bash
set -euo pipefail
umask 077
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PROJECT_NAME=qwerty-learner
ENV_REPO=${ENV_REPO:-/home/ubuntu/env}
RUNTIME_ROOT=${RUNTIME_ROOT:-/home/ubuntu/.deploy-runtime}
mkdir -p "$RUNTIME_ROOT"
chmod 700 "$RUNTIME_ROOT"
exec 8>"$RUNTIME_ROOT/$PROJECT_NAME.lock"
flock 8
SNAPSHOT=$(mktemp "$RUNTIME_ROOT/$PROJECT_NAME.XXXXXX")
trap 'rm -f "$SNAPSHOT"' EXIT
(
  flock 9
  if [ "${SYNC_ENV:-1}" = 1 ]; then git -C "$ENV_REPO" pull --ff-only; fi
  install -m 600 "$ENV_REPO/$PROJECT_NAME/.env" "$SNAPSHOT"
) 9>"$RUNTIME_ROOT/env.lock"
cd "$PROJECT_DIR"
compose() { docker compose --env-file "$SNAPSHOT" "$@"; }
compose config --quiet
docker network inspect public-gateway >/dev/null 2>&1 || docker network create public-gateway
compose up -d --build --wait --wait-timeout 180
