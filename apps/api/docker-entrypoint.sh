#!/bin/sh
set -e

echo "Running database migrations..."
bunx prisma migrate deploy

echo "Starting the application..."
exec bun run dist/index.js
