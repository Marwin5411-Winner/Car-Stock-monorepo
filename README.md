# VBeyond Car Sales System

A comprehensive car sales management system for VBeyond Innovation Co., Ltd.

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime installed
- [Docker](https://www.docker.com/products/docker-desktop/) installed and running (for local Postgres or full stack)

### Portable Windows (no Docker on customer server)

For customer Windows Server installs with external PostgreSQL, click-to-run, auto-start service, and versioned zip updates:

- **Install guide (TH):** [docs/portable-windows-install.md](docs/portable-windows-install.md)
- **Technical contract:** [docs/portable-windows-contract.md](docs/portable-windows-contract.md)
- **Pack release folder:** `bun run pack:windows` (or `bun run pack:windows:zip`)

Docker production and the Docker auto-updater remain fully supported (see below).

### Development Setup

1. **Start the database:**
   ```bash
   docker-compose up -d postgres
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Generate Prisma client:**
   ```bash
   bun run db:generate
   ```

4. **Run database migrations:**
   ```bash
   bun run db:migrate
   ```

5. **Seed the database (optional):**
   ```bash
   bun run db:seed
   ```

6. **Start development servers:**
   ```bash
   bun run dev
   ```

### Development Access Points

- **Frontend:** http://localhost:5173
- **API:** http://localhost:3001
- **API Docs:** http://localhost:3001/docs
- **Prisma Studio:** Run `bun run db:studio`

---

## 🐳 Docker Production Deployment

### Quick Start with Docker

1. **Build and start all services:**
   ```bash
   make up-build
   ```
   Or without make:
   ```bash
   docker compose --env-file .env.docker up -d --build
   ```

2. **Seed the database (first time only):**
   ```bash
   make db-seed
   ```
   Or without make:
   ```bash
   docker compose exec api bunx prisma db seed
   ```

### Production Access Points

- **Frontend:** http://localhost (port 80)
- **API:** http://localhost:3001
- **API Docs:** http://localhost:3001/docs
- **pgAdmin (optional):** http://localhost:5050

### Docker Commands

| Command | Description |
|---------|-------------|
| `make build` | Build all Docker images |
| `make up` | Start all services |
| `make up-build` | Build and start all services |
| `make down` | Stop all services |
| `make restart` | Restart all services |
| `make logs` | View all service logs |
| `make logs-api` | View API logs only |
| `make logs-web` | View Web logs only |
| `make logs-db` | View Database logs only |
| `make clean` | Remove all containers, images, and volumes |
| `make db-seed` | Seed the database |
| `make db-push` | Sync database schema (prisma db push) |
| `make db-migrate` | Run database migrations (legacy) |
| `make monitoring` | Start services with pgAdmin |
| `make shell-api` | Open shell in API container |
| `make shell-db` | Open PostgreSQL shell |

### System Update Commands

| Command | Description |
|---------|-------------|
| `make check-update` | Check if updates are available |
| `make update` | Trigger full update pipeline |
| `make rollback` | Rollback to previous version |
| `make backup` | Create a manual database backup |
| `make backups` | List available database backups |
| `make logs-updater` | View updater service logs |
| `make shell-updater` | Open shell in updater container |

### Enable Database Monitoring (pgAdmin)

To start services with pgAdmin for database monitoring:
```bash
make monitoring
```

Access pgAdmin at http://localhost:5050 with:
- Email: admin@admin.com
- Password: admin

To connect to PostgreSQL in pgAdmin:
- Host: postgres
- Port: 5432
- Username: postgres
- Password: postgres
- Database: car_stock

### Environment Configuration

Copy `.env.docker` and modify as needed:

```env
# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=car_stock

# API Configuration
API_PORT=3001
JWT_SECRET=your-super-secret-jwt-key-change-in-production
NODE_ENV=production
CORS_ORIGIN=http://localhost

# Web Configuration
WEB_PORT=80

# PgAdmin Configuration
PGADMIN_PORT=5050
PGADMIN_EMAIL=admin@admin.com
PGADMIN_PASSWORD=admin

# System Updater Configuration
UPDATE_BRANCH=main
UPDATE_SECRET=change-this-to-a-random-secret
PROJECT_PATH=.    # Absolute path to project on host (e.g. C:\projects\Car-Stock-monorepo on Windows)
```

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Docker Network (car-stock-network)            │
│                                                                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐  │
│  │   web    │   │   api    │   │ postgres │   │   updater    │  │
│  │ (nginx)  │──▶│(bun/node)│──▶│(database)│◀──│ (sidecar)    │  │
│  │  :80     │   │  :3001   │   │  :5432   │   │  :9000       │  │
│  └──────────┘   └─────┬────┘   └──────────┘   └──────┬───────┘  │
│                       │                               │          │
│                       │        HTTP (internal)        │          │
│                       └───────────────────────────────┘          │
│                                                                   │
│  ┌──────────┐   ┌──────────┐                                     │
│  │gotenberg │   │ pgAdmin  │ (optional)                          │
│  │  :3000   │   │  :5050   │                                     │
│  └──────────┘   └──────────┘                                     │
└──────────────────────────────────────────────────────────────────┘
       ▲               ▲
       │               │
  Exposed: 80     Exposed: 3001

  Updater mounts: Docker socket + project source + shared status volume
```

**Note:** PostgreSQL port 5432 is NOT exposed to the host. The updater container is internal-only (port 9000 not exposed).

### Windows Server Deployment Notes

On Windows Server with Docker Desktop (WSL2 backend):

1. **Docker socket**: The default `/var/run/docker.sock` mount works with Docker Desktop's WSL2 integration. If using Windows containers or named pipes, change the volume mount to:
   ```yaml
   - //./pipe/docker_engine://./pipe/docker_engine
   ```

2. **PROJECT_PATH**: Set this to the absolute Windows path in `.env.docker`:
   ```env
   PROJECT_PATH=C:\Users\admin\Car-Stock-monorepo
   ```

3. **Line endings**: The `.gitattributes` file ensures all shell scripts use LF line endings. After cloning on Windows, run:
   ```bash
   git config core.autocrlf false
   git checkout -- .
   ```

4. **Version tagging**: To create a new release from development:
   ```bash
   ./scripts/release.sh patch   # 1.0.0 → 1.0.1
   ./scripts/release.sh minor   # 1.0.0 → 1.1.0
   ./scripts/release.sh major   # 1.0.0 → 2.0.0
   git push origin main --tags
   ```

### System Update Flow

The admin-triggered update pipeline (Settings > System Update):

1. **Pre-flight checks** — disk space, git status
2. **Database backup** — `pg_dump` with gzip compression
3. **Save rollback point** — records current git commit
4. **Git pull** — fetches latest from `main` branch
5. **Build containers** — rebuilds `api` and `web` images
6. **Database schema sync** — `prisma db push` (refuses data-loss changes)
7. **Restart services** — `docker compose up -d api web`
8. **Health check** — verifies API and Web are responding (30s timeout)
9. **Done** — or automatic rollback on any failure

**Automatic backups**: Daily at 17:00 (Bangkok time), retaining the last 5 backups.

## 📁 Project Structure

```
car-stock-monorepo/
├── apps/
│   ├── api/                    # ElysiaJS Backend
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point
│   │   │   ├── lib/            # Database, utilities
│   │   │   └── modules/        # Feature modules (Phase 1+)
│   │   └── prisma/
│   │       ├── schema.prisma   # Database schema
│   │       └── seed.ts         # Seed data
│   │
│   └── web/                    # React Frontend
│       └── src/
│           ├── components/     # UI components
│           ├── lib/            # Utilities
│           └── features/       # Feature modules (Phase 1+)
│
├── packages/
│   └── shared/                 # Shared code
│       └── src/
│           ├── schemas/        # Zod validation schemas
│           ├── types/          # TypeScript types
│           └── constants/      # Shared constants
│
├── docker-compose.yml          # PostgreSQL setup
└── package.json                # Workspace root
```

## 🔧 Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start both API and Web in development mode |
| `bun run dev:api` | Start only the API server |
| `bun run dev:web` | Start only the Web server |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:migrate` | Run database migrations |
| `bun run db:push` | Push schema changes to database |
| `bun run db:seed` | Seed the database with test data |
| `bun run db:studio` | Open Prisma Studio GUI |
| `bun run lint` | Lint code with Biome |
| `bun run format` | Format code with Biome |

## 🔐 Test Credentials (After Seeding)

| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin123 |
| Sales Manager | manager1 | password123 |
| Sales Staff | sales1 | password123 |
| Stock Staff | stock1 | password123 |
| Accountant | account1 | password123 |

## 📋 Implementation Phases

- [x] **Phase 0:** Project Setup (Docker, Dependencies, Shared Packages)
- [ ] **Phase 1:** Core Foundation (Auth, Users, RBAC)
- [ ] **Phase 2:** Sales & Stock Core (Customers, Vehicles, Stock, Sales)
- [ ] **Phase 3:** Document Generation (7 PDF Documents)
- [ ] **Phase 4:** Payments & Finance
- [ ] **Phase 5:** Analytics & Reports
- [ ] **Phase 6:** Polish & Testing

## 🏢 Company Information

**บริษัท วีบียอนด์ อินโนเวชั่น จำกัด**  
VBeyond Innovation Co., Ltd.

438/288 ถนนมิตรภาพ-หนองคาย  
ตำบลในเมือง อำเภอเมือง  
จังหวัดนครราชสีมา 30000

โทร. 044-272-888  
โทรสาร. 044-271-224

---

*See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for detailed development roadmap.*
