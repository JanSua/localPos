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

if ! grep -q '^POSTGRES_PASSWORD=.' .env; then
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
fi

# --- 2. Build the images and start the stack --------------------------------
# PostgreSQL and the session secret use separate persistent Docker volumes.
# The installer intentionally preserves the generated password across runs.
echo "Building nodedr-pos images and starting the stack (this can take a few minutes on first run)..."
docker compose up -d --build

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
