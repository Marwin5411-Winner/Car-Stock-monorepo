# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Car dealership management system (VBeyond) — a Bun monorepo for managing vehicle inventory, sales pipeline, payments, quotations, and reporting. Thai-language UI with English codebase.

## Monorepo Structure

- **apps/api** — ElysiaJS backend (Bun runtime, Prisma ORM, PostgreSQL)
- **apps/web** — React 19 frontend (Vite, Tailwind CSS v4, Radix UI)
- **apps/updater** — Shell-based sidecar for automated deployment/rollback
- **packages/shared** — Shared Zod schemas, TypeScript types, and constants (`@car-stock/shared`)

## Commands

### Development
```bash
bun run dev              # Start API + Web concurrently
bun run build            # Build both apps
bun run lint             # Lint with Biome
bun run format           # Format with Biome
bun run typecheck        # TypeScript type checking
```

### Database (Prisma)
```bash
bun run db:generate      # Generate Prisma client
bun run db:migrate       # Run migrations (prisma migrate dev)
bun run db:push          # Push schema without migration
bun run db:seed          # Seed with test data
```

### API only (from apps/api)
```bash
bun run dev              # Watch mode
bun run build            # Build to dist/
bun test                 # Run tests (Bun test runner)
```

### Docker
```bash
make up-build            # Build and start all services
make down                # Stop services
make db-seed             # Seed database in container
make logs                # View all logs
```

## Architecture

### Backend (apps/api)

**Framework:** ElysiaJS on Bun — routes registered in `src/index.ts` under `/api` group prefix.

**Module pattern:** Each feature is a module in `src/modules/{feature}/` with:
- `{feature}.controller.ts` — Elysia route definitions with `beforeHandle` for auth
- `{feature}.service.ts` — Business logic, Prisma queries, static class instances

**Auth:** JWT tokens (24h expiry) via `@elysiajs/jwt`. Middleware in `src/modules/auth/auth.middleware.ts`:
- `authMiddleware` — requires valid token
- `requireRole(...roles)` — role-based access
- `requirePermission(permission)` — granular permission check

**Error handling:** Custom error classes in `src/lib/errors.ts` (AppError, NotFoundError, BadRequestError, etc.) with global `onError` handler that normalizes Prisma and Zod errors.

**Database:** Prisma schema at `apps/api/prisma/schema.prisma`. Key models: User, Customer, VehicleModel, Stock, Sale, Payment, Quotation, Campaign, InterestPeriod. Stock uses soft deletes (`deletedAt`).

**Number sequences:** Auto-incrementing codes per year (e.g., `SL-2026-0001`) via `NumberSequence` model in `src/lib/contractNumber.ts`.

**Decimal handling:** Prisma returns `Decimal` objects — services convert them to numbers with `toNumber()` helper before JSON serialization.

### Frontend (apps/web)

**Routing:** React Router DOM v7 in `src/App.tsx`. ~40 routes with `ProtectedRoute` wrapper for role-based access.

**State:** AuthContext + CompanyContext for global state. TanStack React Query available for server state. Forms use manual `useState` with local validation.

**API layer:** Custom fetch-based `ApiClient` in `src/lib/api.ts` — auto-attaches JWT from localStorage, handles 401 by clearing token. Per-domain service classes in `src/services/`.

**UI components:** Radix UI primitives wrapped in shadcn/ui-style components at `src/components/ui/`. Variants via CVA. `cn()` helper from `src/lib/utils.ts`.

**Styling:** Tailwind CSS v4 with Thai font (Sarabun). CSS variables for theming in `src/index.css`.

### Shared Package (packages/shared)

Imported as `@car-stock/shared`. Three entry points:
- `@car-stock/shared/schemas` — Zod validation schemas
- `@car-stock/shared/types` — TypeScript interfaces
- `@car-stock/shared/constants` — Role labels, status labels, permissions matrix, number prefixes (includes Thai translations)

## Key Conventions

- **Runtime:** Bun everywhere (package manager, test runner, build)
- **Linting/Formatting:** Biome (not ESLint for formatting) — single quotes, semicolons, 2-space indent, 100 char width
- **Validation:** Zod schemas in shared package, validated at API boundary
- **API responses:** `{ success, data, meta?, error?, message? }` format
- **Roles:** ADMIN, SALES_MANAGER, STOCK_STAFF, ACCOUNTANT, SALES_STAFF
- **Permissions:** Defined in `packages/shared/src/constants/index.ts` PERMISSIONS object
- **Path aliases:** `@/*` → `src/*` in both apps; `@car-stock/shared` → shared package

## Environment

- API `.env` from `apps/api/.env.example`: DATABASE_URL, JWT_SECRET, PORT (3001), CORS_ORIGIN
- Docker `.env.docker` at repo root for production config
- Vite proxies `/api` requests to `http://localhost:3001` in dev

## Seed Credentials (dev only)

admin/admin123, manager1/password123, sales1/password123, stock1/password123, account1/password123
