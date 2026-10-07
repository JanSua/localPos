#!/usr/bin/env bash
# One-click installer for nodedr-pos.
#
# Run this from the repo root after cloning:
#   ./install.sh
#
# It builds the backend + frontend Docker images, starts the stack, waits
# for the backend to come up, then prints the URL to open.

set -euo pipefail

# --- 1. Check prerequisites -------------------------------------------------
# Docker Engine must be installed and the `docker compose` plugin available
# (it ships by default with current Docker Desktop / Docker Engine).
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is not installed." >&2
  echo "Install it from https://docs.docker.com/get-docker/ and re-run this script." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Error: the 'docker compose' plugin was not found." >&2
  echo "Update Docker Desktop/Engine to a version that bundles Compose v2." >&2
  exit 1
fi

# Keep the database credential in the ignored .env file so reinstalling or
# updating the stack never changes credentials for an existing data volume.
if [ ! -f .env ]; then
  cp .env.example .env
fi

env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r' | sed -e 's/^"//' -e 's/"$//'
}

POSTGRES_MODE="$(env_value POSTGRES_MODE)"
POSTGRES_MODE="${POSTGRES_MODE:-local}"
POSTGRES_NETWORK="$(env_value POSTGRES_NETWORK)"
POSTGRES_NETWORK="${POSTGRES_NETWORK:-nodedr-pos-postgres}"
POSTGRES_PASSWORD="$(env_value POSTGRES_PASSWORD)"

if [ "$POSTGRES_MODE" != "local" ] && [ "$POSTGRES_MODE" != "external" ]; then
  echo "Error: POSTGRES_MODE must be either 'local' or 'external'." >&2
  exit 1
fi

if [ -z "$POSTGRES_PASSWORD" ] && [ "$POSTGRES_MODE" = "local" ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "Error: openssl is required to generate a PostgreSQL password." >&2
    exit 1
  fi
  postgres_password="$(openssl rand -hex 32)"
  if grep -q '^POSTGRES_PASSWORD=' .env; then
    sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${postgres_password}/" .env
  else
    printf '\nPOSTGRES_PASSWORD=%s\n' "$postgres_password" >> .env
  fi
elif [ -z "$POSTGRES_PASSWORD" ]; then
  echo "Error: set POSTGRES_PASSWORD in .env when POSTGRES_MODE=external." >&2
  exit 1
fi

# The network is external so this app can join a PostgreSQL network shared
# with other Compose projects. Create it on standalone/local installs.
if ! docker network inspect "$POSTGRES_NETWORK" >/dev/null 2>&1; then
  docker network create "$POSTGRES_NETWORK" >/dev/null
fi

if [ "$POSTGRES_MODE" = "local" ]; then
  echo "Starting the local PostgreSQL container..."
  docker compose --profile local-db up -d db
  db_ready=false
  for _ in $(seq 1 90); do
    db_status="$(docker inspect --format '{{.State.Health.Status}}' nodedr-pos-db 2>/dev/null || true)"
    if [ "$db_status" = "healthy" ]; then
      db_ready=true
      break
    fi
    if [ "$db_status" = "unhealthy" ]; then
      break
    fi
    sleep 1
  done
  if [ "$db_ready" != "true" ]; then
    echo "Error: PostgreSQL did not become healthy. Check: docker compose logs db" >&2
    exit 1
  fi
fi

# --- 2. Build the images and start the app ----------------------------------
# Local PostgreSQL and the session secret persist separately; external mode
# connects to the configured database without starting a database container.
echo "Building nodedr-pos images and starting the stack (this can take a few minutes on first run)..."
docker compose up -d --build backend frontend

# --- 3. Wait for the app to report healthy -----------------------------------
# The backend isn't published to the host; we probe it through the frontend's
# /api proxy on the same port the browser uses. Reads HOST_PORT from .env if
# present (see .env.example), so this works whether or not the default port
# was customized — nothing about this script assumes localhost-only.
HOST_PORT="$(grep -m1 '^HOST_PORT=' .env 2>/dev/null | cut -d= -f2-)"
HOST_PORT="${HOST_PORT:-1994}"

echo "Waiting for the app to come online..."
ready=false
for _ in $(seq 1 90); do
  if curl -sf "http://localhost:${HOST_PORT}/api/health" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [ "$ready" != "true" ]; then
  echo "Warning: the app didn't respond within 90s. Check the logs with:" >&2
  echo "  docker compose logs" >&2
  exit 1
fi

# --- 4. Done ------------------------------------------------------------------
echo ""
echo "nodedr-pos is up and running."
echo "Open http://localhost:${HOST_PORT} in your browser to create your admin account and finish shop setup."
