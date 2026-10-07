#!/usr/bin/env bash
# Create a consistent PostgreSQL custom-format backup from the running stack.
set -euo pipefail
umask 077

backup_dir="${BACKUP_DIR:-backups}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%d-%H%M%S)"
backup_file="$backup_dir/nodedr-pos-${timestamp}.dump"
temp_file="${backup_file}.partial"

env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r' | sed -e 's/^"//' -e 's/"$//'
}

postgres_host="$(env_value POSTGRES_HOST)"
postgres_host="${postgres_host:-postgres}"
postgres_port="$(env_value POSTGRES_PORT)"
postgres_port="${postgres_port:-5432}"
postgres_db="$(env_value POSTGRES_DB)"
postgres_db="${postgres_db:-nodedrpos}"
postgres_user="$(env_value POSTGRES_USER)"
postgres_user="${postgres_user:-nodedr}"
postgres_password="$(env_value POSTGRES_PASSWORD)"
postgres_network="$(env_value POSTGRES_NETWORK)"
postgres_network="${postgres_network:-nodedr-pos-postgres}"

if [ -z "$postgres_password" ]; then
  echo "Error: POSTGRES_PASSWORD is missing from .env." >&2
  exit 1
fi

cleanup() {
  rm -f "$temp_file"
}
trap cleanup EXIT

PGPASSWORD="$postgres_password" docker run --rm \
  --network "$postgres_network" \
  -e PGPASSWORD \
  postgres:18-alpine \
  pg_dump -h "$postgres_host" -p "$postgres_port" -U "$postgres_user" \
    -d "$postgres_db" --format=custom > "$temp_file"
mv "$temp_file" "$backup_file"
trap - EXIT

echo "Backup created: $backup_file"
