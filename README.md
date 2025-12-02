# VBeyond Car Sales System

A comprehensive car sales management system for VBeyond Innovation Co., Ltd.

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime installed
- [Docker](https://www.docker.com/products/docker-desktop/) installed and running

### Setup

1. **Start the database:**
   ```bash
   docker-compose up -d
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

### Access Points

- **Frontend:** http://localhost:5173
- **API:** http://localhost:3001
- **API Docs:** http://localhost:3001/docs
- **Prisma Studio:** Run `bun run db:studio`

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
