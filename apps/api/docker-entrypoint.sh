#!/bin/sh
set -e

echo "Syncing database schema..."
bunx prisma db push --skip-generate

echo "Starting the application..."
exec bun run dist/index.js
