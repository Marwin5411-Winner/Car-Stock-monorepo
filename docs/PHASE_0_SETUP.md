# Phase 0 - Quick Start Setup Guide

This guide will help you complete Phase 0 of the project setup.

## Step 1: Root Package.json (Workspace Configuration)

Create the root `package.json` for the monorepo workspace.

## Step 2: Docker Compose for PostgreSQL

Set up the database container.

## Step 3: Install Backend Dependencies

Install all required ElysiaJS packages.

## Step 4: Install Frontend Dependencies

Install React ecosystem packages.

## Step 5: Create Shared Package

Set up the shared types and schemas package.

---

## Execution Checklist

### 1. Database Setup
```bash
# Start PostgreSQL
docker-compose up -d

# Verify it's running
docker-compose ps
```

### 2. Backend Setup
```bash
cd apps/api

# Install dependencies
bun install

# Initialize Prisma
bunx prisma init

# After schema is ready:
bunx prisma migrate dev --name init
bunx prisma generate
```

### 3. Frontend Setup
```bash
cd apps/web

# Install dependencies
bun install

# Initialize Tailwind
bunx tailwindcss init -p

# Initialize shadcn/ui
bunx shadcn@latest init
```

### 4. Run Development
```bash
# From root directory
bun run dev
```

---

## Expected File Structure After Phase 0

```
car-stock-monorepo/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── lib/
│   │   │   │   └── db.ts
│   │   │   └── modules/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── package.json
│   │
│   └── web/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   └── ui/
│       │   └── lib/
│       │       └── utils.ts
│       ├── tailwind.config.js
│       ├── components.json
│       └── package.json
│
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── schemas/
│       │   ├── types/
│       │   └── constants/
│       ├── package.json
│       └── tsconfig.json
│
├── docker-compose.yml
├── package.json
├── IMPLEMENTATION_PLAN.md
└── Requirement.md
```
