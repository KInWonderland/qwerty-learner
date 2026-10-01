#!/usr/bin/env bash
set -euo pipefail
umask 077
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PROJECT_NAME=qwerty-learner
ENV_FILE=${ENV_FILE:-$PROJECT_DIR/.env}
RUNTIME_ROOT=${RUNTIME_ROOT:-/home/ubuntu/.deploy-runtime}
mkdir -p "$RUNTIME_ROOT"
chmod 700 "$RUNTIME_ROOT"
exec 8>"$RUNTIME_ROOT/$PROJECT_NAME.lock"
flock 8
SNAPSHOT=$(mktemp "$RUNTIME_ROOT/$PROJECT_NAME.XXXXXX")
trap 'rm -f "$SNAPSHOT"' EXIT
install -m 600 "$ENV_FILE" "$SNAPSHOT"
cd "$PROJECT_DIR"
compose() { docker compose --env-file "$SNAPSHOT" "$@"; }
compose config --quiet
docker network inspect public-gateway >/dev/null 2>&1 || docker network create public-gateway
mkdir -p /var/lib/qwerty-learner/data
compose pull
compose up -d --wait --wait-timeout 180
