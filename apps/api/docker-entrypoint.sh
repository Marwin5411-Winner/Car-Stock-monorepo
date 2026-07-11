#!/bin/sh
set -e

# --- Wait for database to be ready and sync schema safely ---
# NEVER use --accept-data-loss here. That flag drops columns/tables on
# schema drift and can wipe production data on every container start.
# Additive changes (new tables/columns) still apply with plain db push;
# destructive changes fail the boot so an operator can intervene.
MAX_RETRIES=15
RETRY_INTERVAL=2
attempt=0

echo "Waiting for database to be ready..."
while [ $attempt -lt $MAX_RETRIES ]; do
  if bunx prisma db push --skip-generate 2>/tmp/db-push-error.log; then
    echo "Database schema synced successfully."
    break
  fi

  attempt=$((attempt + 1))
  error_msg=$(cat /tmp/db-push-error.log 2>/dev/null | tail -20)

  if [ $attempt -ge $MAX_RETRIES ]; then
    echo "ERROR: Database sync failed after $MAX_RETRIES attempts."
    echo "Last error: $error_msg"
    exit 1
  fi

  # Only retry on connection errors, not schema / data-loss errors
  if echo "$error_msg" | grep -qiE "connect|ECONNREFUSED|timeout|not ready|connection refused|P1001|P1000|P1017"; then
    echo "Database not ready (attempt $attempt/$MAX_RETRIES), retrying in ${RETRY_INTERVAL}s..."
    sleep $RETRY_INTERVAL
  else
    echo "ERROR: Database schema sync failed (not a connection issue)."
    echo "Destructive schema changes are refused on purpose (no --accept-data-loss)."
    echo "$error_msg"
    exit 1
  fi
done

echo "Starting the application..."
exec bun run dist/index.js
