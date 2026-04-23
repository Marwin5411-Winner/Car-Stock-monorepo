#!/bin/sh
set -e

# --- Wait for database to be ready ---
MAX_RETRIES=15
RETRY_INTERVAL=2
attempt=0

echo "Waiting for database to be ready..."
while [ $attempt -lt $MAX_RETRIES ]; do
  if bunx prisma db push --skip-generate --accept-data-loss 2>/tmp/db-push-error.log; then
    echo "Database schema synced successfully."
    break
  fi

  attempt=$((attempt + 1))
  error_msg=$(cat /tmp/db-push-error.log 2>/dev/null | tail -5)

  if [ $attempt -ge $MAX_RETRIES ]; then
    echo "ERROR: Database sync failed after $MAX_RETRIES attempts."
    echo "Last error: $error_msg"
    exit 1
  fi

  # Only retry on connection errors, not schema errors
  if echo "$error_msg" | grep -qiE "connect|ECONNREFUSED|timeout|not ready|connection refused"; then
    echo "Database not ready (attempt $attempt/$MAX_RETRIES), retrying in ${RETRY_INTERVAL}s..."
    sleep $RETRY_INTERVAL
  else
    echo "ERROR: Database schema sync failed (not a connection issue)."
    echo "$error_msg"
    exit 1
  fi
done

echo "Starting the application..."
exec bun run dist/index.js
