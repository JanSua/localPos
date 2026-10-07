#!/usr/bin/env bash
# Create a consistent PostgreSQL custom-format backup from the running stack.
set -euo pipefail
umask 077

backup_dir="${BACKUP_DIR:-backups}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%d-%H%M%S)"
backup_file="$backup_dir/nodedr-pos-${timestamp}.dump"
temp_file="${backup_file}.partial"

cleanup() {
  rm -f "$temp_file"
}
trap cleanup EXIT

docker compose exec -T db pg_dump -U nodedr -d nodedrpos --format=custom > "$temp_file"
mv "$temp_file" "$backup_file"
trap - EXIT

echo "Backup created: $backup_file"
