#!/bin/bash
set -e

# Database Backup Script
# Usage: ./backup.sh [scheduled|pre-update]
# Performs pg_dump and rotates backups (keeps last 5)

BACKUP_DIR="/app/backups"
BACKUP_TYPE="${1:-manual}"
MAX_BACKUPS=5
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/car-stock_${TIMESTAMP}_${BACKUP_TYPE}.sql.gz"

# Database connection details (from environment)
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-car_stock}"

echo "[$(date)] Starting $BACKUP_TYPE backup..."

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Run pg_dump and compress
export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -Fc "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[$(date)] Backup completed: $BACKUP_FILE ($FILESIZE)"
else
  echo "[$(date)] ERROR: Backup failed!"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Rotate: keep only the last MAX_BACKUPS files
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/car-stock_*.sql.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
  echo "[$(date)] Rotating backups: removing $REMOVE_COUNT oldest..."
  ls -1t "$BACKUP_DIR"/car-stock_*.sql.gz | tail -n "$REMOVE_COUNT" | xargs rm -f
fi

echo "[$(date)] Backup rotation complete. Current backups:"
ls -lh "$BACKUP_DIR"/car-stock_*.sql.gz 2>/dev/null || echo "  (none)"

# Output the backup file path (used by update.sh)
echo "$BACKUP_FILE"
