#!/bin/bash
set -eo pipefail

# Database Backup Script
# Usage: ./backup.sh [scheduled|pre-update]
# Performs pg_dump and rotates backups (keeps last 5)

BACKUP_DIR="/app/backups"
BACKUP_TYPE="${1:-manual}"
MAX_BACKUPS=5
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/car-stock_${TIMESTAMP}_${BACKUP_TYPE}.dump"
SQL_FILE="$BACKUP_DIR/car-stock_${TIMESTAMP}_${BACKUP_TYPE}.sql"

# Database connection details (from environment)
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-car_stock}"

echo "[$(date)] Starting $BACKUP_TYPE backup..."

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Run pg_dump in custom format (already compressed internally, no need for gzip)
export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -Fc "$DB_NAME" > "$BACKUP_FILE"

if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
  FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[$(date)] Backup completed: $BACKUP_FILE ($FILESIZE)"
else
  echo "[$(date)] ERROR: Backup failed or produced empty file!"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Plain SQL backup for manual recovery (psql < file.sql)
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -Fp --clean --if-exists "$DB_NAME" > "$SQL_FILE"

if [ $? -eq 0 ] && [ -s "$SQL_FILE" ]; then
  SQL_SIZE=$(du -h "$SQL_FILE" | cut -f1)
  echo "[$(date)] SQL backup completed: $SQL_FILE ($SQL_SIZE)"
else
  echo "[$(date)] WARNING: SQL backup failed, .dump backup is still available"
  rm -f "$SQL_FILE"
fi

# Rotate: keep only the last MAX_BACKUPS of each format
for ext in dump sql; do
  FILE_COUNT=$(ls -1 "$BACKUP_DIR"/car-stock_*."$ext" 2>/dev/null | wc -l)
  if [ "$FILE_COUNT" -gt "$MAX_BACKUPS" ]; then
    REMOVE_COUNT=$((FILE_COUNT - MAX_BACKUPS))
    echo "[$(date)] Rotating .$ext backups: removing $REMOVE_COUNT oldest..."
    ls -1t "$BACKUP_DIR"/car-stock_*."$ext" | tail -n "$REMOVE_COUNT" | xargs rm -f
  fi
done

echo "[$(date)] Backup rotation complete. Current backups:"
ls -lh "$BACKUP_DIR"/car-stock_*.dump "$BACKUP_DIR"/car-stock_*.sql 2>/dev/null || echo "  (none)"

# Output the backup file path (used by update.sh)
echo "$BACKUP_FILE"
