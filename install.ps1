#Requires -RunAsAdministrator

# One-click installer for nodedr-pos.
#
# Run this from the repo root after cloning:
#   .\install.ps1
#
# It builds the backend + frontend Docker images, starts the stack, waits
# for the backend to come up, then prints the URL to open.

# --- 1. Check prerequisites -------------------------------------------------
# Docker Engine must be installed and the `docker compose` plugin available
# (it ships by default with current Docker Desktop / Docker Engine).
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Error: Docker is not installed."
  Write-Error "Install it from https://docs.docker.com/get-docker/ and re-run this script."
  exit 1
}

if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
  Write-Error "Error: the 'docker compose' plugin was not found."
  Write-Error "Update Docker Desktop/Engine to a version that bundles Compose v2."
  exit 1
}

# --- 2. Build the images and start the stack --------------------------------
# The SQLite database and the auto-generated session secret persist in the
# `nodedr-pos_data` Docker volume (declared in docker-compose.yml), which
# Compose creates automatically — nothing to set up on the host for this.
Write-Output "Building nodedr-pos images and starting the stack (this can take a few minutes on first run)..."
docker-compose up -d --build

# --- 3. Wait for the app to report healthy -----------------------------------
# The backend isn't published to the host; we probe it through the frontend's
# /api proxy on the same port the browser uses. Reads HOST_PORT from .env if
# present (see .env.example), so this works whether or not the default port
# was customized — nothing about this script assumes localhost-only.
$env:HOST_PORT = (Get-Content .env -ErrorAction SilentlyContinue | Select-String -Pattern '^HOST_PORT=' | ForEach-Object { $_.Line.Split('=')[1].Trim() })
if (-not $env:HOST_PORT) {
  $env:HOST_PORT = "1994"
}

Write-Output "Waiting for the app to come online..."
$ready = $false
for ($i = 1; $i -le 90; $i++) {
  $response = Invoke-WebRequest -Uri "http://localhost:$env:HOST_PORT/api/health" -UseBasicParsing -ErrorAction SilentlyContinue
  if ($response) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 1
}

if (-not $ready) {
  Write-Warning "Warning: the app didn't respond within 90s. Check the logs with:"
  Write-Warning "  docker-compose logs"
  exit 1
}

# --- 4. Done ------------------------------------------------------------------
Write-Output ""
Write-Output "nodedr-pos is up and running."
Write-Output "Open http://localhost:$env:HOST_PORT in your browser to create your admin account and finish shop setup."