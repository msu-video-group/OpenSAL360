#!/bin/bash
set -euo pipefail

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
COMPOSE_FILE="$SCRIPT_DIR/../../docker-compose.production.yml"
OUTPUT_FILE=${1:-backup.sql.gz}
OUTPUT_DIR=$(dirname "$OUTPUT_FILE")

mkdir -p "$OUTPUT_DIR"

docker compose -f "$COMPOSE_FILE" exec -T db bash -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$OUTPUT_FILE"
