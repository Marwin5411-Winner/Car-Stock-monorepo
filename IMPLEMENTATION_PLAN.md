# Car Sales Management System - Implementation Plan

**Project:** VBeyond Innovation Car Sales System  
**Version:** 1.0  
**Created:** December 1, 2025  
**Tech Stack:** React + ElysiaJS (Bun) + Prisma + PostgreSQL  

---

## 📋 Table of Contents

1. [Project Overview](#1-project-overview)
2. [Phase 0: Project Setup](#phase-0-project-setup-week-1)
3. [Phase 1: Core Foundation](#phase-1-core-foundation-weeks-2-3)
4. [Phase 2: Sales & Stock Core](#phase-2-sales--stock-core-weeks-4-6)
5. [Phase 3: Document Generation](#phase-3-document-generation-weeks-7-8)
6. [Phase 4: Payments & Finance](#phase-4-payments--finance-week-9)
7. [Phase 5: Analytics & Reports](#phase-5-analytics--reports-weeks-10-11)
8. [Phase 6: Polish & Testing](#phase-6-polish--testing-week-12)
9. [Detailed Task Breakdown](#detailed-task-breakdown)
10. [Milestones & Deliverables](#milestones--deliverables)

---

## 1. Project Overview

### Current State
- ✅ Monorepo structure created (`apps/api`, `apps/web`)
- ✅ Basic Vite + React setup in `web`
- ✅ Basic ElysiaJS setup in `api`
- ❌ No database setup
- ❌ No shared packages
- ❌ No authentication
- ❌ No core features

### Target Architecture

```
car-stock-monorepo/
├── apps/
│   ├── api/                    # ElysiaJS Backend
│   │   ├── src/
│   │   │   ├── modules/        # Feature modules
│   │   │   ├── middleware/     # Auth, logging, etc.
│   │   │   ├── lib/            # Database, utilities
│   │   │   ├── services/       # Business logic services
│   │   │   └── templates/      # PDF templates
│   │   └── prisma/             # Database schema & migrations
│   │
│   └── web/                    # React Frontend
│       └── src/
│           ├── components/     # Reusable UI components
│           ├── features/       # Feature modules
│           ├── hooks/          # Custom hooks
│           ├── lib/            # Utilities, API client
│           └── routes/         # Route definitions
│
├── packages/
│   └── shared/                 # Shared code
│       ├── schemas/            # Zod schemas
│       ├── types/              # TypeScript types
│       └── constants/          # Shared constants
│
├── docker-compose.yml          # PostgreSQL & services
└── package.json                # Workspace root
```

---

## Phase 0: Project Setup (Week 1)

### 0.1 Monorepo Configuration
- [ ] Set up workspace package.json with scripts
- [ ] Configure TypeScript for monorepo
- [ ] Set up Biome for linting/formatting
- [ ] Create shared packages structure

### 0.2 Database Setup
- [ ] Create docker-compose.yml with PostgreSQL
- [ ] Install and configure Prisma in API
- [ ] Create initial database connection

### 0.3 Backend Foundation
- [ ] Install ElysiaJS dependencies
  - `@elysiajs/cors`
  - `@elysiajs/swagger`
  - `@elysiajs/jwt`
  - `prisma`
  - `@prisma/client`
  - `zod`
  - `pdf-lib`
  - `@pdfme/generator`
- [ ] Set up modular route structure
- [ ] Configure CORS and Swagger

### 0.4 Frontend Foundation
- [ ] Install frontend dependencies
  - `@tanstack/react-query`
  - `@tanstack/react-router`
  - `tailwindcss`
  - `shadcn/ui` components
  - `react-hook-form`
  - `zod`
  - `@hookform/resolvers`
  - `lucide-react`
  - `date-fns`
- [ ] Set up Tailwind CSS
- [ ] Install Shadcn/UI components
- [ ] Configure TanStack Router
- [ ] Set up TanStack Query

### 0.5 Shared Package
- [ ] Create `packages/shared` structure
- [ ] Set up shared TypeScript config
- [ ] Create shared Zod schemas structure
- [ ] Set up shared types

### Deliverables Phase 0:
- ✅ Working monorepo with all dependencies
- ✅ PostgreSQL running in Docker
- ✅ API with Swagger documentation
- ✅ Frontend with routing and UI framework

---

## Phase 1: Core Foundation (Weeks 2-3)

### 1.1 Database Schema (Prisma)

#### User & Auth Models
```prisma
model User {
  id            String   @id @default(cuid())
  username      String   @unique
  email         String   @unique
  password      String
  firstName     String
  lastName      String
  phone         String?
  role          Role     @default(SALES_STAFF)
  status        UserStatus @default(ACTIVE)
  profileImage  String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  sales         Sale[]
  payments      Payment[]
  activities    ActivityLog[]
}

enum Role {
  ADMIN
  SALES_MANAGER
  STOCK_STAFF
  ACCOUNTANT
  SALES_STAFF
}

enum UserStatus {
  ACTIVE
  INACTIVE
}
```

#### Customer Model
```prisma
model Customer {
  id              String       @id @default(cuid())
  code            String       @unique  // CUST-YYYY-XXXX
  type            CustomerType
  salesType       SalesType    @default(NORMAL_SALES)
  name            String
  taxId           String?      @unique
  
  // Address (Thai structure)
  houseNumber     String
  street          String?
  subdistrict     String
  district        String
  province        String
  postalCode      String?
  
  // Contact
  phone           String
  email           String?
  website         String?
  
  // Contact Person
  contactName     String?
  contactRole     String?
  contactMobile   String?
  contactEmail    String?
  
  // Credit
  creditTermDays  Int?
  creditLimit     Decimal?
  notes           String?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  sales           Sale[]
  payments        Payment[]
}

enum CustomerType {
  INDIVIDUAL
  COMPANY
}

enum SalesType {
  NORMAL_SALES
  FLEET_SALES
}
```

#### Vehicle & Stock Models
```prisma
model VehicleModel {
  id              String   @id @default(cuid())
  brand           String
  model           String
  variant         String?
  year            Int
  type            VehicleType
  
  // Colors
  primaryColor    String?
  secondaryColor  String?
  colorNotes      String?
  
  mainOptions     String?
  engineSpecs     String?
  dimensions      String?
  
  price           Decimal
  standardCost    Decimal
  targetMargin    Decimal?
  notes           String?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  stocks          Stock[]
  sales           Sale[]
  campaigns       CampaignVehicleModel[]
}

enum VehicleType {
  SUV
  SEDAN
  PICKUP
  HATCHBACK
  MPV
  EV
}

model Stock {
  id                    String      @id @default(cuid())
  vin                   String      @unique  // VIN = Chassis Number
  engineNumber          String?
  motorNumber1          String?     // EV/Hybrid
  motorNumber2          String?     // EV/Hybrid
  
  vehicleModelId        String
  vehicleModel          VehicleModel @relation(fields: [vehicleModelId], references: [id])
  
  exteriorColor         String
  interiorColor         String?
  
  // Stock Info
  arrivalDate           DateTime
  orderDate             DateTime?
  status                StockStatus @default(AVAILABLE)
  parkingSlot           String?
  
  // Cost Information
  baseCost              Decimal
  transportCost         Decimal     @default(0)
  accessoryCost         Decimal     @default(0)
  otherCosts            Decimal     @default(0)
  financeProvider       String?
  
  // Interest Calculation
  interestRate          Decimal     @default(0)  // Annual %
  interestPrincipalBase InterestBase @default(BASE_COST_ONLY)
  accumulatedInterest   Decimal     @default(0)
  financePaymentDate    DateTime?
  stopInterestCalc      Boolean     @default(false)
  interestStoppedAt     DateTime?
  
  // Sale Information
  expectedSalePrice     Decimal?
  actualSalePrice       Decimal?
  soldDate              DateTime?
  deliveryNotes         String?
  notes                 String?
  
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  
  // Relations
  sale                  Sale?
}

enum StockStatus {
  AVAILABLE
  RESERVED
  PREPARING
  SOLD
}

enum InterestBase {
  BASE_COST_ONLY
  TOTAL_COST
}
```

#### Sale Model (Core)
```prisma
model Sale {
  id                  String      @id @default(cuid())
  saleNumber          String      @unique  // SL-YYYY-XXXX
  type                SaleType
  status              SaleStatus  @default(INQUIRY)
  
  customerId          String
  customer            Customer    @relation(fields: [customerId], references: [id])
  
  stockId             String?     @unique
  stock               Stock?      @relation(fields: [stockId], references: [id])
  
  vehicleModelId      String?     // Preference if no stock
  vehicleModel        VehicleModel? @relation(fields: [vehicleModelId], references: [id])
  
  preferredExtColor   String?
  preferredIntColor   String?
  
  // Pricing
  totalAmount         Decimal
  depositAmount       Decimal     @default(0)
  paidAmount          Decimal     @default(0)
  remainingAmount     Decimal
  
  // Dates
  reservedDate        DateTime?
  expirationDate      DateTime?
  hasExpiration       Boolean     @default(false)
  deliveryDate        DateTime?
  completedDate       DateTime?
  
  // Campaign
  campaignId          String?
  campaign            Campaign?   @relation(fields: [campaignId], references: [id])
  discountSnapshot    Decimal?
  freebiesSnapshot    String?
  
  // Payment Mode
  paymentMode         PaymentMode @default(CASH)
  downPayment         Decimal?
  financeAmount       Decimal?
  financeProvider     String?
  
  // Refund Policy
  refundPolicy        RefundPolicy @default(FULL)
  refundAmount        Decimal?
  
  // Metadata
  notes               String?
  cancellationReason  String?
  
  createdById         String
  createdBy           User        @relation(fields: [createdById], references: [id])
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt
  
  // Relations
  quotations          Quotation[]
  payments            Payment[]
  documents           Document[]
  history             SaleHistory[]
}

enum SaleType {
  RESERVATION_SALE
  DIRECT_SALE
}

enum SaleStatus {
  INQUIRY
  QUOTED
  RESERVED
  PREPARING
  DELIVERED
  COMPLETED
  CANCELLED
}

enum PaymentMode {
  CASH
  FINANCE
  MIXED
}

enum RefundPolicy {
  FULL
  PARTIAL
  NO_REFUND
}
```

#### Payment Model
```prisma
model Payment {
  id              String        @id @default(cuid())
  receiptNumber   String        @unique  // RCPT-YYMM-XXX
  
  customerId      String
  customer        Customer      @relation(fields: [customerId], references: [id])
  
  saleId          String
  sale            Sale          @relation(fields: [saleId], references: [id])
  
  paymentDate     DateTime      @default(now())
  paymentType     PaymentType
  amount          Decimal
  paymentMethod   PaymentMethod
  referenceNumber String?
  notes           String?
  
  status          PaymentStatus @default(ACTIVE)
  voidReason      String?
  voidedAt        DateTime?
  
  issuedBy        String        // Staff name
  createdById     String
  createdBy       User          @relation(fields: [createdById], references: [id])
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}

enum PaymentType {
  DEPOSIT
  DOWN_PAYMENT
  FINANCE_PAYMENT
  OTHER_EXPENSE
}

enum PaymentMethod {
  CASH
  BANK_TRANSFER
  CHEQUE
  CREDIT_CARD
}

enum PaymentStatus {
  ACTIVE
  VOIDED
}
```

#### Campaign Model
```prisma
model Campaign {
  id              String          @id @default(cuid())
  name            String
  description     String?
  status          CampaignStatus  @default(DRAFT)
  startDate       DateTime
  endDate         DateTime
  notes           String?
  
  createdById     String
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  
  // Relations (Many-to-Many with VehicleModel)
  vehicleModels   CampaignVehicleModel[]
  sales           Sale[]
}

model CampaignVehicleModel {
  campaignId      String
  campaign        Campaign     @relation(fields: [campaignId], references: [id])
  vehicleModelId  String
  vehicleModel    VehicleModel @relation(fields: [vehicleModelId], references: [id])
  
  @@id([campaignId, vehicleModelId])
}

enum CampaignStatus {
  DRAFT
  ACTIVE
  ENDED
}
```

#### Supporting Models
```prisma
model Quotation {
  id              String          @id @default(cuid())
  quotationNumber String          @unique  // QTN-YYMM-XXX
  saleId          String
  sale            Sale            @relation(fields: [saleId], references: [id])
  version         Int             @default(1)
  quotedPrice     Decimal
  validUntil      DateTime
  status          QuotationStatus @default(DRAFT)
  notes           String?
  
  createdById     String
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
}

enum QuotationStatus {
  DRAFT
  SENT
  ACCEPTED
  REJECTED
  EXPIRED
  CONVERTED
}

model Document {
  id              String       @id @default(cuid())
  saleId          String
  sale            Sale         @relation(fields: [saleId], references: [id])
  type            DocumentType
  fileName        String
  filePath        String
  generatedAt     DateTime     @default(now())
  generatedById   String
}

enum DocumentType {
  RESERVATION_CONTRACT
  SHORT_RESERVATION_FORM
  CAR_DETAIL_CARD
  SALES_CONFIRMATION
  SALES_RECORD
  DELIVERY_RECEIPT
  THANK_YOU_LETTER
}

model SaleHistory {
  id              String   @id @default(cuid())
  saleId          String
  sale            Sale     @relation(fields: [saleId], references: [id])
  action          String
  fromStatus      String?
  toStatus        String?
  notes           String?
  createdById     String
  createdAt       DateTime @default(now())
}

model ActivityLog {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  action          String
  entity          String
  entityId        String?
  details         Json?
  createdAt       DateTime @default(now())
}
```

### 1.2 Authentication Module

#### Backend Tasks
- [ ] Create auth module structure
- [ ] Implement user registration (admin only)
- [ ] Implement login with JWT
- [ ] Create auth middleware
- [ ] Implement role-based access control
- [ ] Create permission checking utilities

#### Frontend Tasks
- [ ] Create login page
- [ ] Implement auth context/store
- [ ] Create protected routes
- [ ] Add auth token management
- [ ] Create user profile page

### 1.3 User Management Module

#### Backend Tasks
- [ ] CRUD endpoints for users
- [ ] Password hashing with bcrypt
- [ ] User status management
- [ ] Role assignment

#### Frontend Tasks
- [ ] User list page
- [ ] User create/edit form
- [ ] User detail view
- [ ] Role selection component

### Deliverables Phase 1:
- ✅ Complete database schema
- ✅ Authentication working
- ✅ User management functional
- ✅ Role-based access control

---

## Phase 2: Sales & Stock Core (Weeks 4-6)

### 2.1 Customer Management

#### Backend Tasks
- [ ] CRUD endpoints for customers
- [ ] Customer code auto-generation (CUST-YYYY-XXXX)
- [ ] Search and filtering
- [ ] Validation with Zod

#### Frontend Tasks
- [ ] Customer list with search/filter
- [ ] Customer create/edit form (Thai address)
- [ ] Customer detail view
- [ ] Customer type toggle (Individual/Company)

### 2.2 Vehicle Model Management

#### Backend Tasks
- [ ] CRUD endpoints for vehicle models
- [ ] Pricing management
- [ ] Campaign association

#### Frontend Tasks
- [ ] Vehicle model list
- [ ] Model create/edit form
- [ ] Model catalog view

### 2.3 Stock Management

#### Backend Tasks
- [ ] CRUD endpoints for stock
- [ ] Interest calculation service
  ```typescript
  // Interest calculation logic
  calculateDailyInterest(stock: Stock): Decimal {
    const principal = stock.interestPrincipalBase === 'TOTAL_COST'
      ? stock.baseCost + stock.transportCost + stock.accessoryCost + stock.otherCosts
      : stock.baseCost;
    return principal * (stock.interestRate / 100 / 365);
  }
  ```
- [ ] Status transition logic
- [ ] Stock availability check
- [ ] VIN validation

#### Frontend Tasks
- [ ] Stock list with filters (status, model, color)
- [ ] Stock registration form
- [ ] Stock detail view (with cost info for authorized roles)
- [ ] Stock status indicator
- [ ] Interest accumulation display

### 2.4 Sales Module (Core)

#### Backend Tasks
- [ ] Sale CRUD endpoints
- [ ] Sale number generation (SL-YYYY-XXXX)
- [ ] Status transition logic
- [ ] Stock assignment/release
- [ ] Quotation management
- [ ] Sale history tracking

#### Frontend Tasks
- [ ] Sales pipeline view (Kanban style)
- [ ] Sales list with filters
- [ ] Sale detail page with tabs:
  - Overview
  - Documents (Phase 3)
  - Payments (Phase 4)
  - History
- [ ] Create reservation sale flow
- [ ] Create direct sale flow
- [ ] Quotation create/edit
- [ ] Stock assignment modal
- [ ] Status update actions

### 2.5 Campaign Management

#### Backend Tasks
- [ ] CRUD endpoints for campaigns
- [ ] Vehicle model association
- [ ] Campaign status management

#### Frontend Tasks
- [ ] Campaign list
- [ ] Campaign create/edit form
- [ ] Model assignment interface

### Deliverables Phase 2:
- ✅ Full customer management
- ✅ Vehicle model catalog
- ✅ Stock management with interest calculation
- ✅ Sales pipeline with status tracking
- ✅ Campaign management

---

## Phase 3: Document Generation (Weeks 7-8)

### 3.1 PDF Service Setup

#### Backend Tasks
- [ ] Install pdf-lib and pdfme
- [ ] Create PDF service class
- [ ] Configure Thai font (Sarabun)
- [ ] Create document storage (local or S3)

### 3.2 Document Templates

| Document | Method | Priority |
|----------|--------|----------|
| Reservation Contract | pdf-lib (AcroForm) | High |
| Short Reservation Form | pdfme | High |
| Car Detail Card | pdf-lib (AcroForm) | High |
| Sales Confirmation | pdfme | High |
| Sales Record | pdfme | Medium |
| Delivery Receipt | pdfme | High |
| Thank You Letter | pdfme | Medium |

#### Backend Tasks
- [ ] Create AcroForm PDF templates
- [ ] Create pdfme schema definitions
- [ ] Implement each document generator:
  - [ ] Reservation Contract
  - [ ] Short Reservation Form
  - [ ] Car Detail Card
  - [ ] Sales Confirmation
  - [ ] Sales Record
  - [ ] Delivery Receipt
  - [ ] Thank You Letter
- [ ] Document storage and retrieval
- [ ] Auto-generation triggers on status change

#### Frontend Tasks
- [ ] Documents tab in Sale detail
- [ ] Document list with status
- [ ] Download button for each document
- [ ] Print button for each document
- [ ] Batch print functionality
- [ ] Document preview modal

### 3.3 Company Letterhead

- [ ] Create company header component
- [ ] Include logo (Logo_150x150.png)
- [ ] Format company address correctly

### Deliverables Phase 3:
- ✅ All 7 document types generating correctly
- ✅ Thai font support working
- ✅ Documents accessible from Sale page
- ✅ Print and download functionality

---

## Phase 4: Payments & Finance (Week 9)

### 4.1 Payment Management

#### Backend Tasks
- [ ] Payment CRUD endpoints
- [ ] Receipt number generation (RCPT-YYMM-XXX)
- [ ] Payment type validation
- [ ] Amount validation (not exceeding remaining)
- [ ] Void payment logic
- [ ] Commission tracking

#### Frontend Tasks
- [ ] Payments tab in Sale detail
- [ ] Payment list with receipts
- [ ] Add payment modal
- [ ] Payment method selection
- [ ] Void payment (with reason)
- [ ] Receipt preview/download

### 4.2 Finance Integration

#### Backend Tasks
- [ ] Finance amount tracking
- [ ] Down payment calculation
- [ ] Finance provider management

#### Frontend Tasks
- [ ] Finance details section in Sale
- [ ] Finance calculation display

### Deliverables Phase 4:
- ✅ Full payment recording
- ✅ Receipt generation
- ✅ Void functionality
- ✅ Finance tracking

---

## Phase 5: Analytics & Reports (Weeks 10-11)

### 5.1 Dashboard

#### Backend Tasks
- [ ] Dashboard data aggregation endpoints
- [ ] Role-based data filtering
- [ ] Real-time statistics calculation

#### Frontend Tasks
- [ ] Dashboard layout
- [ ] KPI cards:
  - Stock Overview
  - Monthly Sales
  - Revenue
  - Outstanding Payments
- [ ] Charts:
  - Sales trend (line chart)
  - Sales by model (bar chart)
  - Payment mode distribution (pie chart)
- [ ] Recent activity feed
- [ ] Expiring reservations widget
- [ ] Aging stock alerts

### 5.2 Sales Analytics

#### Backend Tasks
- [ ] Sales metrics calculation service
- [ ] Time-based comparisons (MoM, YoY)
- [ ] Conversion rate tracking

#### Frontend Tasks
- [ ] Sales analytics page
- [ ] Date range selector
- [ ] Comparison toggles
- [ ] Performance tables
- [ ] Export functionality

### 5.3 Stock Analytics

#### Backend Tasks
- [ ] Stock metrics calculation
- [ ] Aging distribution
- [ ] Interest cost tracking

#### Frontend Tasks
- [ ] Stock analytics page
- [ ] Aging distribution chart
- [ ] Cost breakdown view
- [ ] Stock turnover metrics

### 5.4 Standard Reports

#### Backend Tasks
- [ ] Report generation endpoints
- [ ] PDF/Excel export

#### Frontend Tasks
- [ ] Reports list page
- [ ] Report parameter forms
- [ ] Export buttons (PDF, Excel)

| Report | Implementation |
|--------|---------------|
| Daily Receipt Report | List + PDF |
| Stock Report | Table + Excel |
| Stock Aging Report | Table + Chart |
| Sales Report | Table + Excel |
| Profit & Loss | Table (Admin only) |

### Deliverables Phase 5:
- ✅ Executive dashboard
- ✅ Sales analytics with trends
- ✅ Stock analytics
- ✅ Standard report generation
- ✅ Export functionality

---

## Phase 6: Polish & Testing (Week 12)

### 6.1 Notifications

#### Backend Tasks
- [ ] Notification service
- [ ] Trigger setup:
  - Reservation expiring
  - Stock aging
  - Payment received
  - Campaign ending

#### Frontend Tasks
- [ ] Notification dropdown
- [ ] Notification list page
- [ ] Mark as read

### 6.2 Testing

- [ ] Unit tests for critical services
- [ ] API endpoint testing
- [ ] Frontend component testing
- [ ] End-to-end testing (critical flows)

### 6.3 Performance & Security

- [ ] Query optimization
- [ ] API rate limiting
- [ ] Input sanitization review
- [ ] XSS prevention check

### 6.4 Polish

- [ ] Loading states
- [ ] Error handling
- [ ] Empty states
- [ ] Responsive design check
- [ ] Thai language review

### Deliverables Phase 6:
- ✅ Notification system
- ✅ Test coverage
- ✅ Performance optimized
- ✅ Production ready

---

## Detailed Task Breakdown

### Backend Module Structure

```
apps/api/src/
├── index.ts                    # Entry point
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.schema.ts
│   │   └── auth.middleware.ts
│   ├── users/
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── users.schema.ts
│   ├── customers/
│   │   ├── customers.controller.ts
│   │   ├── customers.service.ts
│   │   └── customers.schema.ts
│   ├── vehicles/
│   │   ├── vehicles.controller.ts
│   │   ├── vehicles.service.ts
│   │   └── vehicles.schema.ts
│   ├── stock/
│   │   ├── stock.controller.ts
│   │   ├── stock.service.ts
│   │   ├── stock.schema.ts
│   │   └── interest.service.ts
│   ├── sales/
│   │   ├── sales.controller.ts
│   │   ├── sales.service.ts
│   │   ├── sales.schema.ts
│   │   └── quotations.service.ts
│   ├── payments/
│   │   ├── payments.controller.ts
│   │   ├── payments.service.ts
│   │   └── payments.schema.ts
│   ├── documents/
│   │   ├── documents.controller.ts
│   │   ├── documents.service.ts
│   │   └── templates/
│   │       ├── reservation-contract.ts
│   │       ├── short-reservation.ts
│   │       ├── car-detail-card.ts
│   │       ├── sales-confirmation.ts
│   │       ├── sales-record.ts
│   │       ├── delivery-receipt.ts
│   │       └── thank-you-letter.ts
│   ├── campaigns/
│   │   ├── campaigns.controller.ts
│   │   ├── campaigns.service.ts
│   │   └── campaigns.schema.ts
│   ├── analytics/
│   │   ├── analytics.controller.ts
│   │   ├── analytics.service.ts
│   │   ├── sales-analytics.ts
│   │   └── stock-analytics.ts
│   └── notifications/
│       ├── notifications.controller.ts
│       └── notifications.service.ts
├── lib/
│   ├── db.ts                   # Prisma client
│   ├── jwt.ts                  # JWT utilities
│   └── utils.ts                # Helpers
└── middleware/
    ├── auth.ts                 # Auth middleware
    ├── rbac.ts                 # Role-based access
    └── logger.ts               # Request logging
```

### Frontend Feature Structure

```
apps/web/src/
├── main.tsx
├── App.tsx
├── components/
│   ├── ui/                     # Shadcn components
│   ├── layout/
│   │   ├── MainLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   └── common/
│       ├── DataTable.tsx
│       ├── SearchInput.tsx
│       ├── StatusBadge.tsx
│       └── LoadingSpinner.tsx
├── features/
│   ├── auth/
│   │   ├── LoginPage.tsx
│   │   ├── AuthContext.tsx
│   │   └── useAuth.ts
│   ├── dashboard/
│   │   ├── DashboardPage.tsx
│   │   └── widgets/
│   ├── customers/
│   │   ├── CustomerListPage.tsx
│   │   ├── CustomerDetailPage.tsx
│   │   ├── CustomerForm.tsx
│   │   └── hooks/
│   ├── vehicles/
│   │   ├── VehicleModelListPage.tsx
│   │   ├── VehicleModelForm.tsx
│   │   └── hooks/
│   ├── stock/
│   │   ├── StockListPage.tsx
│   │   ├── StockDetailPage.tsx
│   │   ├── StockForm.tsx
│   │   └── hooks/
│   ├── sales/
│   │   ├── SalesListPage.tsx
│   │   ├── SalesDetailPage.tsx
│   │   ├── SalesPipeline.tsx
│   │   ├── CreateSaleFlow.tsx
│   │   ├── DirectSaleFlow.tsx
│   │   ├── components/
│   │   │   ├── SaleOverviewTab.tsx
│   │   │   ├── SaleDocumentsTab.tsx
│   │   │   ├── SalePaymentsTab.tsx
│   │   │   └── SaleHistoryTab.tsx
│   │   └── hooks/
│   ├── payments/
│   │   ├── PaymentListPage.tsx
│   │   ├── PaymentForm.tsx
│   │   └── hooks/
│   ├── campaigns/
│   │   ├── CampaignListPage.tsx
│   │   ├── CampaignForm.tsx
│   │   └── hooks/
│   ├── reports/
│   │   ├── ReportsPage.tsx
│   │   ├── DailyReceiptReport.tsx
│   │   ├── StockReport.tsx
│   │   └── SalesReport.tsx
│   └── analytics/
│       ├── AnalyticsDashboard.tsx
│       ├── SalesAnalytics.tsx
│       └── StockAnalytics.tsx
├── hooks/
│   ├── useApi.ts
│   ├── usePermissions.ts
│   └── useNotifications.ts
├── lib/
│   ├── api.ts                  # API client
│   ├── utils.ts
│   └── constants.ts
├── routes/
│   └── index.tsx               # Route definitions
└── stores/
    └── authStore.ts
```

---

## Milestones & Deliverables

| Phase | Week | Milestone | Key Deliverables |
|-------|------|-----------|------------------|
| 0 | 1 | Project Setup | Monorepo, DB, Base UI |
| 1 | 2-3 | Foundation | Auth, Users, RBAC |
| 2 | 4-6 | Core Features | Customers, Stock, Sales |
| 3 | 7-8 | Documents | All 7 PDF documents |
| 4 | 9 | Payments | Payment recording, receipts |
| 5 | 10-11 | Analytics | Dashboard, Reports |
| 6 | 12 | Polish | Testing, Optimization |

### Success Criteria

- [ ] Users can login with role-based access
- [ ] Complete sales workflow (Inquiry → Completed)
- [ ] All 7 documents downloadable from Sale page
- [ ] Stock management with interest calculation
- [ ] Payment recording with receipts
- [ ] Dashboard with key metrics
- [ ] Reports exportable to PDF/Excel
- [ ] Mobile-responsive design

---

## Getting Started

### Prerequisites
- Bun runtime installed
- Docker Desktop installed
- VS Code with recommended extensions

### Initial Commands

```bash
# 1. Start database
docker-compose up -d

# 2. Install dependencies
bun install

# 3. Generate Prisma client
cd apps/api && bunx prisma generate

# 4. Run migrations
bunx prisma migrate dev

# 5. Seed initial data
bunx prisma db seed

# 6. Start development
bun run dev
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Complex PDF generation | Start with simpler templates first |
| Thai font issues | Test early with Sarabun font |
| Performance with analytics | Use database views/materialized views |
| Scope creep | Strict adherence to requirements doc |

---

## Notes

- **Priority**: Sales & Stock modules are the core - build these first
- **Documents**: Can be incrementally added, start with Reservation Contract
- **Analytics**: Can be basic initially, enhance over time
- **Thai Language**: All UI should support Thai, test early
- **Testing**: Focus on critical paths - sales flow, payments

---

*Implementation Plan Version: 1.0*  
*Created: December 1, 2025*  
*Status: Ready to Execute*
