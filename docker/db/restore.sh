#!/bin/bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path to backup.sql.gz>" >&2
  exit 1
fi

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
COMPOSE_FILE="$SCRIPT_DIR/../../docker-compose.production.yml"
BACKUP_FILE=$1
DROP="DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

gunzip < "$BACKUP_FILE" | (echo "$DROP" && cat) | docker compose -f "$COMPOSE_FILE" exec -T db bash -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
