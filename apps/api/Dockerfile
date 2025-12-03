# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy workspace package files
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN bun install

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Generate Prisma client
WORKDIR /app/apps/api
RUN bunx prisma generate

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:1-slim AS production

WORKDIR /app

# Install OpenSSL and curl for Prisma and health checks
RUN apt-get update -y && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Copy node_modules and production dependencies from the builder image so
# generated Prisma client and query engine binaries are available.
# Copying the full node_modules from the builder ensures the correct
# Prisma engine binary (e.g. debian-openssl-3.0.x) is present.
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy entrypoint script
COPY apps/api/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/apps/api

# Expose API port
EXPOSE 3001

# Start the application with migrations
ENTRYPOINT ["docker-entrypoint.sh"]
