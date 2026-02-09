# Car Sales Management System - Requirements Document V2

**Project Name:** Car Sales Management System (VBeyond Innovation)  
**Version:** 2.0 (Rebuild)  
**Date:** December 1, 2025  
**Status:** 📝 Requirement Clarification Phase  
**Tech Stack:** React + ElysiaJS (Bun) + Prisma + PostgreSQL  
**Company:** บริษัท วีบียอนด์ อินโนเวชั่น จำกัด (VBeyond Innovation Co., Ltd.)  

---

## 📋 Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Concept: Sales-Centric System](#2-core-concept-sales-centric-system)
3. [Document Management (Critical)](#3-document-management-critical)
4. [User Roles & Permissions](#4-user-roles--permissions)
5. [Module Requirements](#5-module-requirements)
   - [5.1 Authentication & User Management](#51-authentication--user-management)
   - [5.2 Customer Management](#52-customer-management)
   - [5.3 Vehicle & Stock Management](#53-vehicle--stock-management)
   - [5.4 Sales Process (Core Module)](#54-sales-process-core-module)
   - [5.5 Payment & Finance](#55-payment--finance)
   - [5.6 Campaign & Promotions](#56-campaign--promotions)
   - [5.7 Reports & Dashboard](#57-reports--dashboard)
   - [5.8 Notifications](#58-notifications)
6. [Data Models](#6-data-models)
7. [Business Rules](#7-business-rules)
8. [Open Questions](#8-open-questions)
9. [Tech Stack Details](#9-tech-stack-details)
10. [Project Structure](#10-project-structure)

---

## 1. Project Overview

### 1.1 Background
This system is a **digital transformation** from paper-based car sales management to a fully computerized system for an on-premise car dealership operation.

### 1.2 Goals
- ✅ **Centralize ALL business operations** in one system
- ✅ **Sales & Stock are the core modules** - everything revolves around them
- ✅ **All documents printable/downloadable** from the system
- ✅ Track vehicle inventory with cost calculation (interest accumulation)
- ✅ Manage the complete sales pipeline: Inquiry → Quotation → Reservation → Payment → Delivery
- ✅ Generate ALL official documents (Contracts, Receipts, Reports)
- ✅ **Deep business analytics** for decision making
- ✅ Role-based access control for different staff levels

### 1.3 Key Business Requirements
1. **Document-Centric**: Every transaction must produce downloadable/printable documents
2. **Sales-Centric**: Sales module is the hub where users access and download all related documents
3. **Stock Tracking**: Full lifecycle from arrival → sale with cost/interest tracking
4. **Business Intelligence**: Deep statistics for business insights

### 1.4 Current Pain Points (From Existing System Analysis)
- [ ] Scattered processes - quotation, reservation, payment are separate modules
- [ ] No unified "Sale" entity to track the complete journey
- [ ] Documents not centralized - hard to find all docs for one sale
- [ ] Limited business analytics

---

## 2. Core Concept: Sales-Centric System

> 💡 **Key Insight:** Everything should be centralized around the **SALE** concept.

### 2.1 What is a "Sale"?

A **Sale** represents the complete journey of selling a car to a customer:

```
Customer Interest → Quotation → Reservation → Payments → Delivery → Completed Sale
```

### 2.2 Sales Pipeline Stages

| Stage | Description | Thai |
|-------|-------------|------|
| `INQUIRY` | Customer shows interest, no formal quote yet | สอบถาม |
| `QUOTED` | Quotation has been created and sent | เสนอราคาแล้ว |
| `RESERVED` | Customer paid deposit, car is reserved | จองแล้ว |
| `PREPARING` | Preparing for delivery | เตรียมส่งมอบ |
| `DELIVERED` | Car delivered, pending final payment | ส่งมอบแล้ว |
| `COMPLETED` | All payments received, sale complete | เสร็จสิ้น |
| `CANCELLED` | Sale cancelled at any stage | ยกเลิก |

### 2.3 Sales Types

| Type | Description | Thai |
|------|-------------|------|
| `RESERVATION_SALE` | Customer reserves → selects car later → pays | ขายผ่านการจอง |
| `DIRECT_SALE` | Customer picks specific car → pays immediately | ขายตรง |

### 2.4 Payment Modes

| Mode | Description | Thai |
|------|-------------|------|
| `CASH` | Full payment in cash | เงินสด |
| `FINANCE` | Via finance company | ผ่านไฟแนนซ์ |
| `MIXED` | Part cash, part finance | ผสม |

---

## 3. Document Management (Critical) 📄

> ⭐ **This is a critical feature** - All documents must be accessible from the Sales module

### 3.1 Document Overview

The system must generate and manage **7 key documents** throughout the sales lifecycle:

| # | Document | Thai Name | When Generated | Access From |
|---|----------|-----------|----------------|-------------|
| 1 | Car Reservation Contract | สัญญาจองรถยนต์ | Reservation ACTIVE | Sales |
| 2 | Short Reservation Form | ใบจอง (ย่อ) | Deposit received | Sales |
| 3 | Car Detail Card | การ์ดรายละเอียดรถยนต์ | After SOLD | Sales/Stock |
| 4 | Sales Confirmation Letter | หนังสือยืนยันการซื้อ-ขาย | PREPARING/SOLD | Sales |
| 5 | Sales Record | ใบบันทึกการขาย | After SOLD | Sales |
| 6 | Vehicle Delivery Receipt | ใบปล่อยรถ/ใบรับรถ | Delivery day | Sales |
| 7 | Thank You Letter | หนังสือขอบคุณ | Delivery day | Sales |

### 3.2 Document Details

#### 📄 Document 1: Car Reservation Contract (สัญญาจองรถยนต์)

**Purpose:** Primary legal agreement between dealer and customer

**Source:** `Chery- สัญญาจองรถยนต์ ปี 2568`

**Trigger:** When Reservation status → `ACTIVE` (deposit paid)

**Data Required:**
```
From Reservation:
- Reservation Number
- Reservation Date
- Deposit Amount
- Refund Policy
- Total Price
- Expiration Date

From Customer:
- Full Name
- ID Card Number (เลขบัตรประชาชน)
- Full Address (Thai format)
- Phone Number

From VehicleModel/Stock:
- Brand, Model, Variant
- Year
- Color (Exterior/Interior)
- Price

From Payment:
- Deposit payment status
- Payment method
```

**Template Fields:**
- [ ] Contract header with company logo
- [ ] Customer information section
- [ ] Vehicle information section
- [ ] Price and payment terms
- [ ] Refund policy clause
- [ ] Terms and conditions
- [ ] Signature lines (Customer & Dealer)

---

#### 📄 Document 2: Short Reservation Form (ใบจอง - ย่อ)

**Purpose:** Quick receipt for walk-in deposits before full contract

**Trigger:** Immediately upon receiving deposit payment

**Data Required:**
```
From Payment:
- Receipt Number
- Payment Date
- Amount
- Payment Method

From Customer:
- Name
- Phone

From VehicleModel:
- Brand, Model
- Color preference
```

**Template Fields:**
- [ ] Simple receipt format
- [ ] Customer basic info
- [ ] Vehicle preference
- [ ] Deposit amount
- [ ] Staff signature

---

#### 📄 Document 3: Car Detail Card (การ์ดรายละเอียดรถยนต์)

**Purpose:** Internal "Deal Sheet" / Unit Profitability Record

**Access:** ADMIN, ACCOUNTANT, STOCK_STAFF only (contains cost info)

**Trigger:** After vehicle is SOLD (for margin verification)

**Data Required:**
```
From Stock:
- VIN
- Chassis Number
- Engine Number
- Base Cost
- Transport Cost
- Accessory Cost
- Other Costs
- Arrival Date
- Accumulated Interest
- Finance Provider

From Reservation/Sale:
- Selling Price
- Down Payment
- Finance Amount
- Discount Applied

From CommissionPayment:
- Commission Amount
- Commission Rate

From Payment:
- All receipt numbers
```

**Calculated Fields:**
```
Total Cost = Base + Transport + Accessories + Other + Interest
Gross Margin = Selling Price - Total Cost
Net Margin = Gross Margin - Commission
Margin % = (Net Margin / Selling Price) × 100
Days in Stock = Sold Date - Arrival Date
```

**Template Fields:**
- [ ] Vehicle identification section
- [ ] Cost breakdown table
- [ ] Sales information
- [ ] Commission deduction
- [ ] Profit calculation summary
- [ ] Approval signatures

---

#### 📄 Document 4: Sales Confirmation Letter (หนังสือยืนยันการซื้อ-ขาย)

**Purpose:** Official confirmation for:
- Department of Land Transport (กรมการขนส่งทางบก)
- Finance company confirmation

**Trigger:** When Stock status → `PREPARING` or `SOLD`

**Data Required:**
```
From Customer:
- Full Name
- ID Card Number
- Address

From Stock:
- VIN
- Chassis Number
- Engine Number
- Brand, Model, Year
- Color

From Reservation:
- Sale Price
- Payment Terms
```

**Template Fields:**
- [ ] Official letter format
- [ ] Company letterhead
- [ ] Customer details
- [ ] Complete vehicle specifications
- [ ] Sale confirmation statement
- [ ] Company stamp & signature

---

#### 📄 Document 5: Sales Record (ใบบันทึกการขาย)

**Purpose:** Detailed internal price breakdown for accounting

**Access:** ADMIN, ACCOUNTANT only

**Trigger:** After SOLD (internal accounting use)

**Data Required:**
```
From Reservation:
- Total Amount
- Deposit Amount
- Remaining Amount

From Payments:
- All payment records
- Payment methods
- Dates

Finance Details:
- Down Payment
- Finance Amount
- Interest Rate
- Monthly Payment
- Number of Installments
```

**Template Fields:**
- [ ] Price breakdown table
- [ ] Payment history
- [ ] Finance calculation
- [ ] Net amount received
- [ ] Accountant verification

---

#### 📄 Document 6: Vehicle Delivery Receipt (ใบปล่อยรถ/ใบรับรถ)

**Purpose:** Legal proof of vehicle inspection and handover

**Trigger:** On actual delivery date

**Status Update:** Stock `PREPARING` → `SOLD`

**Data Required:**
```
From Stock:
- VIN
- Chassis Number
- Odometer Reading
- Fuel Level
- Accessories included

From Customer:
- Name
- ID Card

Checklist Items:
- [ ] Vehicle condition
- [ ] Documents provided (manual, warranty)
- [ ] Keys (quantity)
- [ ] Accessories verified
```

**Template Fields:**
- [ ] Vehicle identification
- [ ] Condition checklist
- [ ] Items handed over
- [ ] Customer acknowledgment
- [ ] Both party signatures
- [ ] Date and time

---

#### 📄 Document 7: Thank You Letter (หนังสือขอบคุณ)

**Purpose:** Formal thank you + confirmation of discounts/gifts (fraud prevention)

**Trigger:** Handed over on delivery day

**Data Required:**
```
From Customer:
- Name

From Reservation:
- Campaign applied
- Discount amount
- Freebies/gifts received

From Stock:
- Vehicle details
```

**Template Fields:**
- [ ] Thank you message
- [ ] Vehicle purchased
- [ ] List of gifts/discounts received
- [ ] Customer signature confirming receipt
- [ ] Company signature

---

### 3.3 Document Access in Sales Module

```
Sales Detail Page
├── Overview Tab
│   └── Sale summary, status, timeline
├── Documents Tab ⭐
│   ├── 📄 Reservation Contract [Download] [Print]
│   ├── 📄 Short Reservation Form [Download] [Print]
│   ├── 📄 Sales Confirmation [Download] [Print]
│   ├── 📄 Sales Record [Download] [Print] (Accountant+)
│   ├── 📄 Car Detail Card [Download] [Print] (Admin+)
│   ├── 📄 Delivery Receipt [Download] [Print]
│   └── 📄 Thank You Letter [Download] [Print]
├── Payments Tab
│   └── Payment history with receipts
└── History Tab
    └── Status change log
```

### 3.4 Document Generation Requirements

- [x] **PDF Generation**: All documents as PDF
- [x] **Thai Font Support**: Sarabun font (already configured)
- [x] **Company Branding**: Logo + company letterhead format
- [x] **Print-Ready**: A4 format, proper margins
- [ ] **No Digital Signatures Required**: Physical signatures only
- [ ] **Batch Print**: Print multiple documents at once
- [ ] **Document History**: Track when documents were generated/printed

### 3.5 PDF Generation Approach

| Document | Method | Notes |
|----------|--------|-------|
| Reservation Contract | **pdf-lib** (AcroForm) | Adobe Acrobat form template |
| Short Reservation Form | **pdf-lib** (AcroForm) | Adobe Acrobat form template |
| Car Detail Card | **pdf-lib** (AcroForm) | Adobe Acrobat form template |
| Sales Confirmation | pdfme or pdf-lib | With header |
| Sales Record | pdfme or pdf-lib | Internal use |
| Delivery Receipt | pdfme or pdf-lib | With header |
| Thank You Letter | pdfme | Already has template |
| **Payment Receipt** | **Dot Matrix** | Future: For printer support |

### 3.6 Company Letterhead (Existing)

```
Logo: Logo_150x150.png
Company: บริษัท วีบียอนด์ อินโนเวชั่น จำกัด
Address: 438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง
         อำเภอเมือง จังหวัดนครราชสีมา 30000
Phone:   โทร. 044-272-888 โทรสาร. 044-271-224
```

---

## 4. User Roles & Permissions

### 4.1 Role Definitions

| Role | Thai Name | Description |
|------|-----------|-------------|
| `ADMIN` | กรรมการ | Full system access, see all costs & profits |
| `SALES_MANAGER` | ผู้จัดการขาย | Manage sales team, see profits (not costs) |
| `STOCK_STAFF` | พนักงานสต็อก | Manage inventory, see costs (not profits) |
| `ACCOUNTANT` | พนักงานบัญชี | Manage payments, financial reports |
| `SALES_STAFF` | พนักงานขาย | Create quotations, reservations, basic sales |

### 4.2 Permission Matrix

> ⚠️ **Single Source of Truth:** `packages/shared/src/constants/index.ts` → `PERMISSIONS` object.
> ทั้ง Frontend (route guards) และ Backend (middleware + service) ใช้ค่าจากที่เดียวกัน

| Permission Key | ADMIN | SALES_MGR | STOCK_STAFF | ACCOUNTANT | SALES_STAFF |
|----------------|:-----:|:---------:|:-----------:|:----------:|:-----------:|
| **User Management** | | | | | |
| `USER_CREATE` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `USER_UPDATE` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `USER_DELETE` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `USER_VIEW` | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Customer Management** | | | | | |
| `CUSTOMER_CREATE` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `CUSTOMER_UPDATE` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `CUSTOMER_DELETE` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `CUSTOMER_VIEW` | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Vehicle Model Management** | | | | | |
| `VEHICLE_VIEW` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `VEHICLE_EDIT` | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Stock Management** | | | | | |
| `STOCK_CREATE` | ✅ | ❌ | ✅ | ❌ | ❌ |
| `STOCK_UPDATE` | ✅ | ❌ | ✅ | ❌ | ❌ |
| `STOCK_DELETE` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `STOCK_VIEW` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `STOCK_VIEW_COST` | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Sales Management** | | | | | |
| `SALE_CREATE` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `SALE_UPDATE` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `SALE_STATUS_UPDATE` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `SALE_CANCEL` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `SALE_ASSIGN_STOCK` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `SALE_DELETE` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `SALE_VIEW` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SALE_VIEW_PROFIT` | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Quotation Management** | | | | | |
| `QUOTATION_CREATE` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `QUOTATION_UPDATE` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `QUOTATION_DELETE` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `QUOTATION_CONVERT` | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Payment Management** | | | | | |
| `PAYMENT_CREATE` | ✅ | ❌ | ❌ | ✅ | ❌ |
| `PAYMENT_VOID` | ✅ | ❌ | ❌ | ✅ | ❌ |
| `PAYMENT_VIEW` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Campaign Management** | | | | | |
| `CAMPAIGN_CREATE` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `CAMPAIGN_UPDATE` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `CAMPAIGN_DELETE` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `CAMPAIGN_VIEW` | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Interest Management** | | | | | |
| `INTEREST_VIEW` | ✅ | ❌ | ✅ | ✅ | ❌ |
| `INTEREST_UPDATE` | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Reports** | | | | | |
| `REPORTS_INDEX` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `REPORT_ALL` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `REPORT_SALES` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `REPORT_STOCK` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `REPORT_FINANCE` | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Settings** | | | | | |
| `SETTINGS_VIEW` | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Documents** | | | | | |
| `DOC_CAR_DETAIL_CARD` | ✅ | ❌ | ✅ | ✅ | ❌ |
| `DOC_SALES_RECORD` | ✅ | ❌ | ❌ | ✅ | ❌ |
| `DOC_GENERAL` | ✅ | ✅ | ✅ | ✅ | ✅ |

### 4.3 Document Access by Role

| Document | ADMIN | SALES_MGR | STOCK_STAFF | ACCOUNTANT | SALES_STAFF |
|----------|-------|-----------|-------------|------------|-------------|
| Reservation Contract | ✅ | ✅ | ✅ | ✅ | ✅ |
| Short Reservation Form | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sales Confirmation | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Car Detail Card** | ✅ | ❌ | ✅ | ✅ | ❌ |
| **Sales Record** | ✅ | ❌ | ❌ | ✅ | ❌ |
| Delivery Receipt | ✅ | ✅ | ✅ | ✅ | ✅ |
| Thank You Letter | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 5. Module Requirements

### 5.1 Authentication & User Management

#### Features
- [ ] User login with username/password
- [ ] JWT-based authentication (24h expiry)
- [ ] User profile management
- [ ] Password reset (Admin only or self-service?)
- [ ] Login audit log

#### User Fields
```
- Username (unique)
- Password (hashed)
- Email (unique)
- First Name
- Last Name
- Phone Number
- Role (enum)
- Status (ACTIVE/INACTIVE)
- Profile Image (optional)
```

#### ❓ Open Questions
- [ ] Should users be able to reset their own password?
- [ ] Do we need 2FA?
- [ ] Should there be login attempt limits?

---

### 5.2 Customer Management

#### Features
- [ ] CRUD for customers
- [ ] Customer code auto-generation
- [ ] Support both Individual and Company types
- [ ] Structured Thai address (6 fields)
- [ ] Contact person information
- [ ] Credit terms management
- [ ] Customer search and filtering

#### Customer Types
| Type | Thai | Description |
|------|------|-------------|
| `INDIVIDUAL` | บุคคลธรรมดา | Personal customer |
| `COMPANY` | นิติบุคคล | Corporate customer |

#### Sales Types (Per Customer)
| Type | Thai | Description |
|------|------|-------------|
| `NORMAL_SALES` | ขายปกติ | Regular retail sales |
| `FLEET_SALES` | ขายฟลีท | Fleet/bulk sales |

#### Customer Fields
```
Basic Info:
- Customer Code (auto-generated, unique)
- Type (INDIVIDUAL/COMPANY)
- Sales Type (NORMAL_SALES/FLEET_SALES)
- Name
- Tax ID (unique)

Address (Thai Structure):
- House Number (บ้านเลขที่) *required
- Street (ถนน)
- Subdistrict (แขวง/ตำบล) *required
- District (เขต/อำเภอ) *required
- Province (จังหวัด) *required
- Postal Code (รหัสไปรษณีย์)

Contact:
- Phone Number *required
- Email
- Website

Contact Person:
- Name
- Role/Position
- Mobile
- Email

Credit Terms:
- Credit Term Days
- Credit Limit
- Notes
```

#### ❓ Open Questions
- [ ] Customer code format: `CUST-YYYY-XXXX` or different?
- [ ] Is credit limit actually used for blocking sales?
- [ ] Should we track customer purchase history differently?

---

### 5.3 Vehicle & Stock Management

#### 5.3.1 Vehicle Models (Master Data)

##### Features
- [ ] CRUD for vehicle models
- [ ] Pricing: Sale price & Standard cost
- [ ] Multiple variants per model

##### Vehicle Model Fields
```
- Brand (ยี่ห้อ)
- Model (รุ่น)
- Variant (รุ่นย่อย) - e.g., "2.8V 4WD"
- Year (Model Year)
- Type (SUV/SEDAN/PICKUP/etc.)
- Colors (Primary, Secondary, Notes)
- Main Options (description)
- Engine Specs
- Dimensions
- Price (ราคาขาย)
- Standard Cost (ราคาทุนมาตรฐาน)
- Target Margin %
- Notes
```

#### 5.3.2 Stock (Individual Vehicles)

##### Features
- [ ] Register new vehicle into stock
- [ ] Track VIN (= Chassis Number), Engine numbers
- [ ] **Interest calculation on holding cost** ⭐
- [ ] Status tracking: AVAILABLE → RESERVED → PREPARING → SOLD
- [ ] Support EV/Hybrid motor numbers
- [ ] Cost breakdown (base, transport, accessories, other)
- [ ] Single location (no warehouse tracking)

##### Stock Fields
```
Vehicle Identity:
- VIN (Vehicle Identification Number) *unique
  └── Note: VIN = Chassis Number (เลขตัวถัง) - same value
- Engine Number
- Motor Number 1 (EV/Hybrid)
- Motor Number 2 (EV/Hybrid)
- Vehicle Model (reference)
- Exterior Color
- Interior Color

Stock Info:
- Arrival Date (วันที่เข้าสต็อก)
- Order Date
- Status (AVAILABLE/RESERVED/PREPARING/SOLD)
- Parking Slot (optional, for internal reference)

Cost Information:
- Base Cost (ราคาทุน)
- Transport Cost
- Accessory Cost
- Other Costs
- Finance Provider

Interest Calculation: ⭐
- Current Interest Rate (% per year)
- Interest Principal Base (BASE_COST_ONLY or TOTAL_COST)
- Accumulated Interest
- Finance Payment Date (when interest stops)
- Stop Interest Calculation (boolean)
- Interest Stopped At

Sale Information:
- Expected Sale Price
- Actual Sale Price
- Sold Date
- Sale Type (DIRECT/RESERVATION)
- Notes
- Delivery Notes
```

##### Interest Calculation Logic 🔢
```
Daily Interest = Principal × (Annual Rate / 365)
Accumulated Interest = Sum of daily interest from arrival date

Principal Options:
1. BASE_COST_ONLY: Only base cost
2. TOTAL_COST: Base + Transport + Accessories + Other

Interest Stops When:
- Finance payment is made (financePaymentDate set)
- Manual stop (stopInterestCalculation = true)
```

##### Stock Statuses & Triggers ✅

| Status | Thai | Description | Trigger |
|--------|------|-------------|---------|
| `AVAILABLE` | พร้อมขาย | Ready for sale | Initial status when added |
| `RESERVED` | จองแล้ว | Reserved by customer | When assigned to a Sale |
| `PREPARING` | เตรียมส่งมอบ | Being prepared for delivery | **Auto: When Sale has Stock assigned** |
| `SOLD` | ขายแล้ว | Sold and delivered | Delivery Receipt signed |

##### Status Transition Rules

```
AVAILABLE → RESERVED    : Stock assigned to Sale (reservation)
AVAILABLE → PREPARING   : Stock assigned to Sale (direct sale, paid)
RESERVED  → PREPARING   : Full payment received OR manual trigger
PREPARING → SOLD        : Delivery completed (receipt signed)
RESERVED  → AVAILABLE   : Sale cancelled (stock released)
```

##### ✅ Clarified Stock Questions

| Question | Answer |
|----------|--------|
| VIN = Chassis Number? | **Yes** ✅ Same value, use VIN only |
| PREPARING trigger? | **Auto** - When Sale is active AND Stock is assigned |
| Track maintenance/PDI? | **No** ❌ Not needed |
| Multiple warehouses? | **No** ❌ Single location only |

---

### 5.4 Sales Process (Core Module) ⭐

> This is the **central module** that ties everything together.
> All documents are accessed from the Sale detail page.

#### 5.4.1 Unified Sale Entity ✅ (Confirmed)

```
┌─────────────────────────────────────────────────────────────┐
│                         SALE                                 │
├─────────────────────────────────────────────────────────────┤
│  Sale Number: SL-2025-0001                                  │
│  Type: RESERVATION_SALE | DIRECT_SALE                       │
│  Status: QUOTED → RESERVED → PREPARING → DELIVERED          │
├─────────────────────────────────────────────────────────────┤
│  Customer ─────────────────────────────────────────────────→│
│  Stock (optional at first) ────────────────────────────────→│
│  VehicleModel (preference) ────────────────────────────────→│
├─────────────────────────────────────────────────────────────┤
│  Quotations[] (version history)                              │
│  Payments[]                                                  │
│  Documents[] (generated PDFs)                                │
│  History[] (status changes)                                  │
└─────────────────────────────────────────────────────────────┘
```

#### 5.4.2 Sale Types

| Type | Flow | Description |
|------|------|-------------|
| `RESERVATION_SALE` | Quote → Reserve → Pay → Deliver | Standard flow with reservation contract |
| `DIRECT_SALE` | Select Car → Pay → Deliver | Walk-in customer, immediate purchase |

#### 5.4.3 Sale Statuses

| Status | Thai | Description | Next Actions |
|--------|------|-------------|--------------|
| `INQUIRY` | สอบถาม | Initial contact, no quote yet | Create Quote |
| `QUOTED` | เสนอราคา | Quotation sent to customer | Accept/Reject |
| `RESERVED` | จองแล้ว | Deposit paid, car reserved | Assign Stock, Prepare |
| `PREPARING` | เตรียมส่งมอบ | Vehicle being prepared | Complete Preparation |
| `DELIVERED` | ส่งมอบแล้ว | Car delivered to customer | Collect Final Payment |
| `COMPLETED` | เสร็จสิ้น | All done, fully paid | Archive |
| `CANCELLED` | ยกเลิก | Cancelled at any stage | - |

#### 5.4.4 Direct Sale Flow (Simplified) ✅

For walk-in customers who want to buy immediately:

```
Step 1: Select Customer (or create new)
           ↓
Step 2: Select Available Stock (specific car with VIN)
           ↓
Step 3: Apply Campaign (optional)
           ↓
Step 4: Choose Payment Mode
        ├── CASH: Full payment now
        └── FINANCE: Down payment + Finance details
           ↓
Step 5: Record Payment
           ↓
Step 6: Generate Documents
        ├── Short Reservation Form (if deposit)
        ├── Sales Confirmation
        └── Delivery Receipt (when delivered)
           ↓
Step 7: Complete Sale
```

**Direct Sale creates:**
- Sale record (type: DIRECT_SALE)
- Payment record(s)
- Stock status → SOLD
- All documents accessible from Sale page

#### 5.4.5 Reservation Sale Flow (Standard)

```
Step 1: Create Quotation
        ├── Customer
        ├── Vehicle Model (preference)
        └── Price & Terms
           ↓
Step 2: Customer Accepts → Create Reservation
        ├── Deposit Amount
        ├── Expiration Date (optional)
        └── Refund Policy
           ↓
Step 3: Assign Stock (when available)
        ├── Select specific VIN
        └── Stock status → RESERVED
           ↓
Step 4: Collect Payments
        ├── Down Payment
        ├── Finance Amount
        └── Other
           ↓
Step 5: Prepare Vehicle
        └── Stock status → PREPARING
           ↓
Step 6: Delivery
        ├── Delivery Receipt signed
        └── Stock status → SOLD
           ↓
Step 7: Complete
        └── All payments received
```

#### 5.4.6 Sale Fields

```
Sale Entity:
- Sale Number (auto: SL-YYYY-XXXX)
- Sale Type (RESERVATION_SALE / DIRECT_SALE)
- Status (pipeline stage)
- Customer (reference)
- Stock (optional initially, required for completion)
- Vehicle Model (preference if no stock)
- Preferred Colors

Pricing:
- Total Amount
- Deposit Amount
- Paid Amount
- Remaining Amount

Dates:
- Created Date
- Reserved Date
- Expiration Date (for reservations)
- Delivery Date
- Completed Date

Campaign:
- Campaign Applied (reference)
- Discount Snapshot
- Freebies Snapshot

Payment Mode:
- Mode (CASH / FINANCE / MIXED)
- Down Payment
- Finance Amount
- Finance Provider

Metadata:
- Created By (salesperson)
- Notes
- Cancellation Reason (if cancelled)
```

#### 5.4.7 Quotation (Part of Sale)

##### Features
- [ ] Create quotation for customer
- [ ] Link to specific stock or just vehicle model
- [ ] Apply campaigns/discounts
- [ ] Set validity period
- [ ] Print/Export as PDF
- [ ] Multiple quote versions per sale

##### Quotation Fields
```
- Quotation Number (auto: QTN-YYMM-XXX)
- Sale (parent reference)
- Version (1, 2, 3...)
- Quoted Price
- Valid Until
- Status (DRAFT/SENT/ACCEPTED/REJECTED/EXPIRED)
- Campaign Applied (snapshot of discount)
- Notes
- Created By (salesperson)
```

##### Quotation Statuses
| Status | Description |
|--------|-------------|
| `DRAFT` | Just created, not sent |
| `SENT` | Sent to customer |
| `ACCEPTED` | Customer accepted |
| `REJECTED` | Customer rejected |
| `EXPIRED` | Past valid until date |
| `CONVERTED` | Converted to reservation |

#### 5.4.3 Reservation

##### Features
- [ ] Create from quotation or standalone
- [ ] **Can reserve without specific car** (just model preference)
- [ ] Link to specific stock later
- [ ] Track deposits and payments
- [ ] Set expiration (or no expiration)
- [ ] Refund policy settings
- [ ] Print reservation contract

##### Reservation Fields
```
- Reservation Number (auto: RSV-YYYY-XXXX)
- Customer (reference)
- Stock (optional initially)
- Vehicle Model (preference if no stock)
- Preferred Colors (exterior/interior)
- From Quotation (optional reference)
- Reservation Date
- Expiration Date (nullable = no expiry)
- Has Expiration (boolean)
- Total Amount
- Deposit Amount
- Paid Amount
- Refund Policy (FULL/PARTIAL/NO_REFUND)
- Refund Amount (if cancelled)
- Status (REQUESTED/ACTIVE/COMPLETED/CANCELLED/EXPIRED)
- Campaign Applied (snapshot)
- Notes
- Cancellation Reason
- Created By (salesperson)
```

##### Reservation Statuses
| Status | Thai | Description |
|--------|------|-------------|
| `REQUESTED` | ระบุความต้องการ | Model preference stated, no car assigned |
| `ACTIVE` | จองแล้ว | Specific car assigned and reserved |
| `COMPLETED` | เสร็จสิ้น | Full payment received, delivered |
| `CANCELLED` | ยกเลิก | Cancelled by customer or expired |
| `EXPIRED` | หมดอายุ | Passed expiration date |

#### 5.4.4 Direct Sale

##### Features
- [ ] Quick sale for walk-in customers
- [ ] Must select specific stock
- [ ] Immediate payment (full or partial)
- [ ] Support cash or finance mode

##### Direct Sale Flow
```
1. Select Customer (or create new)
2. Select Stock (available cars only)
3. Apply Campaign (optional)
4. Enter Payment Details
   - Cash: Full amount
   - Finance: Down payment + Finance amount
5. Create Sale + First Payment
6. Stock status → SOLD (if paid) or RESERVED (if partial)
```

#### ❓ Open Questions (Sales)
- [ ] Should we use unified "Sale" entity or keep separate Quotation/Reservation?
- [ ] Can one quotation become multiple reservations?
- [ ] How is commission calculated and tracked?
- [ ] Do we need approval workflow for discounts?
- [ ] Trade-in vehicle support needed?
- [ ] Multiple vehicles per sale (fleet)?

---

### 5.5 Payment & Finance

#### Features
- [ ] Record payments against reservations
- [ ] Multiple payment types
- [ ] Generate receipts (PDF + optional Dot Matrix)
- [ ] Void receipts with reason
- [ ] Track payment methods
- [ ] QR code on receipts for verification

#### Payment Types
| Type | Thai | Description |
|------|------|-------------|
| `DEPOSIT` | เงินจอง | Initial booking deposit |
| `DOWN_PAYMENT` | เงินดาวน์ | Down payment |
| `FINANCE_PAYMENT` | ยอดไฟแนนซ์ | Amount from finance company |
| `OTHER_EXPENSE` | ค่าใช้จ่ายอื่น | Other charges |

#### Payment Methods
| Method | Description |
|--------|-------------|
| `CASH` | Cash payment |
| `BANK_TRANSFER` | Bank transfer |
| `CHEQUE` | Cheque payment |
| `CREDIT_CARD` | Credit card |

#### Payment Fields
```
- Receipt Number (auto: RCPT-YYMM-XXX)
- Customer (reference)
- Reservation (reference)
- Payment Date
- Payment Type
- Amount
- Payment Method
- Reference Number (bank ref/cheque no.)
- Notes
- Status (ACTIVE/VOIDED)
- Void Reason
- Voided At
- Issued By (staff name)
- Created By (user reference)
```

#### Commission Tracking
```
- Reservation (reference)
- Salesperson (reference)
- Commission Amount
- Commission Rate %
- Paid At
- Payment Method
- Reference Number
- Notes
```

#### ❓ Open Questions (Payments)
- [ ] Is there a limit on payment split count?
- [ ] Do we need refund tracking as separate entity?
- [ ] VAT calculation needed?
- [ ] Receipt number format preference?

---

### 5.6 Campaign & Promotions

> ⚠️ **Updated:** Campaigns are now for **Analytics Only** - assigned to Vehicle Models, not individual vehicles, and do NOT affect pricing.

#### Purpose
- Track which campaigns are associated with which vehicle models
- Analytics and reporting purposes only
- No automatic price calculation or discount application

#### Features
- [ ] Create campaigns with date ranges
- [ ] Assign campaigns to **Vehicle Models** (not individual stocks)
- [ ] Track campaign performance in analytics
- [ ] **No price effect** - campaigns don't automatically apply discounts

#### Campaign Fields
```
- Name
- Description
- Status (DRAFT/ACTIVE/ENDED)
- Start Date
- End Date
- Vehicle Models[] (many-to-many relationship)
- Created By
- Updated By
- Notes
```

#### Campaign Analytics Use Cases
- Which models have active campaigns?
- How many sales were made during campaign period?
- Compare sales before/during/after campaign
- Model popularity during campaigns

#### ❓ Open Questions (Campaigns)
- [x] ~~Can campaigns stack?~~ N/A - Analytics only
- [x] ~~Model-specific campaigns?~~ Yes - assigned to Vehicle Models
- [ ] Do we need campaign budget tracking?

---

### 5.7 Reports, Dashboard & Business Analytics ⭐

> 💡 **Deep business statistics** is a key requirement for this system

#### 5.7.1 Dashboard Widgets

| Widget | Who Can See | Description |
|--------|-------------|-------------|
| Stock Overview | ALL | Available/Reserved/Sold counts |
| Today's Activity | ALL (filtered) | New customers, quotations, payments |
| Monthly Sales | ADMIN, SALES_MGR | Sales performance |
| Revenue | ADMIN, ACCOUNTANT | Payment collections |
| Outstanding Payments | ADMIN, ACCOUNTANT | Unpaid reservations |
| Aging Stock | ADMIN, STOCK_STAFF | Cars in stock > 90 days |
| Expiring Reservations | ADMIN, SALES_MGR, SALES | Next 7 days |
| Profit & Margin | ADMIN only | Full P&L visibility |
| Personal Target | SALES_STAFF | Own performance |

#### 5.7.2 Standard Reports

| Report | Access | Description |
|--------|--------|-------------|
| Daily Receipt Report | ADMIN, ACCOUNTANT | All payments for a day |
| Stock Report | ADMIN, STOCK_STAFF, SALES_MGR | Inventory status |
| Stock Aging Report | ADMIN, STOCK_STAFF | Days in stock |
| Sales Report | ADMIN, SALES_MGR | Sales by period/salesperson |
| Profit & Loss | ADMIN only | Full cost and margin |
| Customer Report | ADMIN, SALES_MGR | Customer analytics |
| Campaign Performance | ADMIN | Campaign effectiveness |

#### 5.7.3 Deep Business Analytics ⭐

> Customer requires **deep statistics** for business decision making

##### Sales Analytics

| Metric | Description | Calculation |
|--------|-------------|-------------|
| **Total Revenue** | Total sales amount | Sum of all completed sales |
| **Sales Growth** | MoM / YoY comparison | (Current - Previous) / Previous × 100% |
| **Average Deal Size** | Average sale value | Total Revenue / Number of Sales |
| **Conversion Rate** | Quotation → Sale | Sales / Quotations × 100% |
| **Sales Velocity** | Time from quote to close | Avg days from quotation to completed |
| **Sales by Model** | Top selling models | Group by vehicle model |
| **Sales by Salesperson** | Performance ranking | Group by salesperson |
| **Sales by Payment Mode** | Cash vs Finance mix | Group by payment mode |
| **Sales by Customer Type** | Individual vs Company | Group by customer type |
| **Fleet vs Retail** | Sales type distribution | Group by sales type |

##### Stock Analytics

| Metric | Description | Calculation |
|--------|-------------|-------------|
| **Stock Turnover** | How fast stock sells | COGS / Average Inventory |
| **Days in Stock** | Average holding period | Avg (Sold Date - Arrival Date) |
| **Aging Distribution** | 0-30, 31-60, 61-90, 90+ days | Count by age bucket |
| **Stock Value** | Total inventory value | Sum of (Cost + Interest) for all stock |
| **Interest Cost** | Total accumulated interest | Sum of accumulated interest |
| **Cost Breakdown** | Base vs Additional costs | % by cost category |

##### Profitability Analytics

| Metric | Description | Calculation |
|--------|-------------|-------------|
| **Gross Profit** | Before commission | Sale Price - Total Cost |
| **Net Profit** | After commission | Gross Profit - Commission |
| **Gross Margin %** | Percentage margin | (Gross Profit / Sale Price) × 100% |
| **Net Margin %** | After all deductions | (Net Profit / Sale Price) × 100% |
| **Profit by Model** | Most profitable models | Avg profit per model |
| **Profit by Salesperson** | Revenue per person | Total profit per salesperson |
| **Commission Ratio** | Commission as % of sales | Total Commission / Total Sales |

##### Customer Analytics

| Metric | Description | Calculation |
|--------|-------------|-------------|
| **Customer Acquisition** | New customers per period | Count of new customers |
| **Repeat Customers** | Returning buyers | Customers with > 1 purchase |
| **Customer Lifetime Value** | Total revenue per customer | Sum of all purchases |
| **Geographic Distribution** | Sales by province/region | Group by location |
| **Customer Type Distribution** | Individual vs Company | Percentage breakdown |

##### Campaign Analytics

| Metric | Description | Calculation |
|--------|-------------|-------------|
| **Campaign ROI** | Return on discount | Revenue Generated / Discount Given |
| **Discount Impact** | Avg discount per sale | Total Discounts / Number of Sales |
| **Campaign Conversion** | Leads converted | Sales with campaign / Total uses |
| **Popular Campaigns** | Most used campaigns | Ranked by usage |

##### Time-Based Analytics

| Period | Comparisons Available |
|--------|----------------------|
| Daily | vs Yesterday, vs Same day last week |
| Weekly | vs Last week, vs Same week last month |
| Monthly | vs Last month, vs Same month last year (MoM, YoY) |
| Quarterly | vs Last quarter, vs Same quarter last year |
| Yearly | vs Last year |

##### Visualization Requirements

- [ ] **Line Charts**: Trends over time (sales, revenue)
- [ ] **Bar Charts**: Comparisons (by model, by salesperson)
- [ ] **Pie Charts**: Distribution (payment modes, customer types)
- [ ] **Tables**: Detailed data with sorting/filtering
- [ ] **KPI Cards**: Key metrics with trend indicators
- [ ] **Heat Maps**: Geographic sales distribution
- [ ] **Funnels**: Sales pipeline conversion

#### Export Formats
- [ ] PDF
- [ ] Excel (XLSX)
- [ ] CSV

#### ❓ Open Questions (Reports)
- [ ] Specific KPI calculations needed?
- [ ] Comparison periods (MoM, YoY)?
- [ ] Scheduled report emails?
- [ ] Target/Goal setting for salespeople?
- [ ] Commission calculation formula?

---

### 5.8 Notifications

#### Notification Types
| Type | Recipients | Trigger |
|------|------------|---------|
| Reservation Expiring | ADMIN, SALES | 7, 3, 1 days before expiry |
| Stock Aging | ADMIN, STOCK_STAFF | Car in stock > 90 days |
| Payment Received | ADMIN, ACCOUNTANT | New payment recorded |
| Campaign Ending | ADMIN | Campaign ends in 3 days |
| Low Stock Alert | ADMIN, STOCK_STAFF | (if configured) |

#### Notification Channels
- [ ] In-app notifications
- [ ] Email notifications (optional)
- [ ] (Future) LINE notifications?

---

## 6. Data Models

### 6.1 Entity Relationship Diagram (Simplified)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│    User     │────<│  Quotation   │>────│  Customer   │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │                    │
       │            ┌──────┴──────┐             │
       │            ▼             │             │
       │     ┌──────────────┐     │             │
       └────<│ Reservation  │>────┴─────────────┘
             └──────────────┘
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
   ┌──────────┐ ┌────────┐ ┌────────┐
   │  Stock   │ │Payment │ │Campaign│
   └──────────┘ └────────┘ └────────┘
         │
         ▼
   ┌──────────────┐
   │VehicleModel  │
   └──────────────┘
```

### 6.2 Key Relationships

| From | To | Relationship |
|------|-----|--------------|
| User | Quotation | 1:N (created by) |
| User | Reservation | 1:N (created by) |
| User | Payment | 1:N (created by) |
| Customer | Quotation | 1:N |
| Customer | Reservation | 1:N |
| Customer | Payment | 1:N |
| VehicleModel | Stock | 1:N |
| Stock | Quotation | 1:N |
| Stock | Reservation | 1:N |
| Quotation | Reservation | 1:1 (optional) |
| Reservation | Payment | 1:N |
| Campaign | Stock | N:N |
| Campaign | Quotation | 1:N |
| Campaign | Reservation | 1:N |

---

## 7. Business Rules

### 7.1 Stock Rules
1. Stock can only be RESERVED if status is AVAILABLE
2. Stock can only be SOLD if status is RESERVED or AVAILABLE
3. Interest calculation stops when `financePaymentDate` is set
4. VIN and Chassis Number are unique across all stocks

### 7.2 Quotation Rules
1. Quotation expires automatically after `validUntil` date
2. Only DRAFT or SENT quotations can be edited
3. Converting to reservation changes status to CONVERTED

### 7.3 Reservation Rules
1. REQUESTED status: No specific stock assigned yet
2. ACTIVE status: Specific stock is assigned
3. Reservation expires if `hasExpiration` is true and past `expirationDate`
4. Stock is released back to AVAILABLE when reservation is cancelled

### 7.4 Payment Rules
1. Cannot exceed remaining balance on reservation
2. VOIDED payments don't count towards paid amount
3. Only ADMIN and ACCOUNTANT can void payments
4. Receipt numbers are sequential and never reused

### 7.5 Permission Rules
1. Users can only see data according to their role
2. Cost information hidden from SALES roles
3. Profit information hidden from STOCK roles
4. Personal data filtered for SALES_STAFF

### 7.6 Document Rules
1. Documents are accessible from Sales module
2. Cost-related documents (Car Detail Card, Sales Record) restricted by role
3. All documents must be available for download and print
4. Document generation triggers based on status changes

### 7.7 Stock Status Rules ✅
1. **PREPARING** is triggered automatically when:
   - Sale is active (status = RESERVED or later)
   - AND Stock (individual vehicle) is assigned to the Sale
2. Stock can only be assigned to one active Sale at a time
3. VIN = Chassis Number (same field, no duplication)

### 7.8 Campaign Rules ✅
1. Campaigns are assigned to **Vehicle Models** (not individual stocks)
2. Campaigns are for **Analytics only** - no automatic price effect
3. Campaign data used for reporting and trend analysis

---

## 8. Open Questions

> ⚠️ Items marked ✅ are confirmed, ❓ still need clarification

### ✅ Confirmed Requirements

| # | Item | Answer | Notes |
|---|------|--------|-------|
| 1 | Main purpose | Centralize everything digitally | Transform from paper to computer |
| 2 | Core modules | Sales & Stock | Everything revolves around these |
| 3 | Document access | All from Sales module | Users download documents from sale detail page |
| 4 | Analytics | Deep business statistics | Comprehensive KPIs and insights |
| 5 | Brand | **VBeyond** | VBeyond Innovation (Electric vehicles) |
| 6 | Unified Sale Entity | **Yes** ✅ | Create one Sale entity containing everything |
| 7 | Direct Sale Flow | **Yes** ✅ | Simpler flow for walk-in customers |
| 8 | Commission | **Fixed amount per car** | Not percentage-based |
| 9 | Digital Signatures | **Not required** | Physical signatures only |
| 10 | Company Letterhead | **Required** | Logo + address format (existing) |
| 11 | Dot Matrix Printer | **Future** | For Payment Receipt only, leave for now |
| 12 | Other Documents | **PDF only** | Standard PDF generation |
| 13 | PDF Templates | **AcroForm (pdf-lib)** | Using Adobe Acrobat forms |
| 14 | KPIs/Targets | **TBD** | Leave for now, clarify later |
| 15 | VIN = Chassis Number | **Yes** ✅ | Same value, use VIN only |
| 16 | PREPARING trigger | **Auto** ✅ | When Sale active + Stock assigned |
| 17 | Track maintenance/PDI | **No** ❌ | Not needed |
| 18 | Multiple warehouses | **No** ❌ | Single location only |
| 19 | Campaign purpose | **Analytics only** ✅ | No price effect |
| 20 | Campaign assignment | **Vehicle Models** ✅ | Not individual stocks |

### 📋 Remaining Questions (Minor)

#### Sales Process

1. **Reservation Expiration:**
   - [ ] Default expiration period? (30 days? 60 days? No limit?)
   - [ ] Auto-cancel when expired?

#### Commission & Finance

2. **Commission Details:**
   - [x] Fixed amount per car ✅
   - [ ] What is the fixed amount? (e.g., 5,000 THB per car?)
   - [ ] When is commission paid? (At sale? At delivery? At full payment?)
   - [ ] Who approves commission?

3. **Discount:**
   - [ ] Can salespeople give manual discounts?
   - [ ] Is manager approval needed for large discounts?

#### Customer & Vehicle

4. **Customer ID:**
   - [ ] Is เลขบัตรประชาชน required for individuals?
   - [ ] For companies, Tax ID only?

5. **Vehicle Models:**
   - [ ] What VBeyond models are available? (need list for dropdown)

10. **Vehicle Models:**
#### Vehicle & Customer

6. **Vehicle Brand:**
   - [x] VBeyond brand ✅ (Electric vehicles)
   - [ ] What models are available? (need list for dropdown)

7. **Customer ID:**
   - [ ] เลขบัตรประชาชน required for individuals?
   - [ ] For companies, Tax ID only?

#### Operations

8. **Multi-branch:**
   - [ ] Single location or multiple branches?
   - [ ] If multiple, separate stock per branch?

9. **Sales Targets (Future):**
   - [ ] Leave for now - clarify later
   - [ ] Do salespeople have monthly targets?

---

## 9. Tech Stack Details

### 9.1 Frontend

| Technology | Purpose |
|------------|---------|
| **React 18** | UI Framework |
| **TypeScript** | Type safety |
| **Vite** | Build tool |
| **TanStack Query** | Data fetching & caching |
| **TanStack Router** | Type-safe routing |
| **Tailwind CSS** | Styling |
| **Shadcn/ui** | UI Components |
| **React Hook Form** | Form handling |
| **Zod** | Validation (shared with backend) |

### 9.2 Backend

| Technology | Purpose |
|------------|---------|
| **Bun** | Runtime |
| **ElysiaJS** | API Framework |
| **TypeScript** | Type safety |
| **Prisma** | ORM |
| **PostgreSQL** | Database |
| **JWT (jose)** | Authentication |
| **Zod** | Validation |
| **pdf-lib** | AcroForm PDF filling |
| **pdfme** | Dynamic PDF generation |
| **@elysiajs/cors** | CORS handling |
| **@elysiajs/swagger** | API Documentation |

### 9.3 Shared

| Technology | Purpose |
|------------|---------|
| **Zod Schemas** | Shared validation |
| **TypeScript Types** | Shared type definitions |
| **API Contracts** | End-to-end type safety |

### 9.4 DevOps

| Technology | Purpose |
|------------|---------|
| **Docker** | Containerization |
| **Docker Compose** | Local development |
| **Biome** | Linting & Formatting |

---

## 10. Project Structure

```
car-sales-system/
├── apps/
│   ├── web/                    # React Frontend
│   │   ├── src/
│   │   │   ├── components/     # Reusable UI components
│   │   │   ├── features/       # Feature modules
│   │   │   │   ├── auth/
│   │   │   │   ├── customers/
│   │   │   │   ├── sales/      # Central sales module ⭐
│   │   │   │   ├── stock/
│   │   │   │   ├── payments/
│   │   │   │   ├── campaigns/
│   │   │   │   ├── reports/
│   │   │   │   ├── analytics/  # Deep business analytics ⭐
│   │   │   │   └── dashboard/
│   │   │   ├── hooks/          # Custom hooks
│   │   │   ├── lib/            # Utilities
│   │   │   ├── routes/         # Route definitions
│   │   │   └── stores/         # Global state
│   │   ├── public/
│   │   └── package.json
│   │
│   └── api/                    # ElysiaJS Backend
│       ├── src/
│       │   ├── modules/        # Feature modules
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── customers/
│       │   │   ├── vehicles/
│       │   │   ├── stock/
│       │   │   ├── sales/      # Central sales module ⭐
│       │   │   ├── documents/  # Document generation ⭐
│       │   │   ├── payments/
│       │   │   ├── campaigns/
│       │   │   ├── reports/
│       │   │   ├── analytics/  # Deep analytics ⭐
│       │   │   └── notifications/
│       │   ├── middleware/
│       │   ├── lib/            # Database, utilities
│       │   ├── services/
│       │   │   ├── pdf.service.ts      # PDF generation
│       │   │   ├── interest.service.ts # Interest calculation
│       │   │   └── analytics.service.ts # Analytics calculations
│       │   ├── templates/      # PDF templates
│       │   │   ├── reservation-contract.ts
│       │   │   ├── car-detail-card.ts
│       │   │   ├── sales-confirmation.ts
│       │   │   ├── sales-record.ts
│       │   │   ├── delivery-receipt.ts
│       │   │   └── thank-you-letter.ts
│       │   └── index.ts        # Entry point
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       └── package.json
│
├── packages/
│   └── shared/                 # Shared code
│       ├── schemas/            # Zod schemas
│       ├── types/              # TypeScript types
│       ├── constants/          # Shared constants
│       └── documents/          # Document type definitions
│
├── docker-compose.yml
├── package.json                # Workspace root
├── turbo.json                  # Turborepo config
└── README.md
```

---

## 📝 Next Steps

1. **Review & Clarify:**
   - Review this document
   - Answer the open questions in Section 8
   - Share document templates if available

2. **Design Phase:**
   - Finalize data models
   - Design UI/UX mockups (Figma?)
   - Define API contracts
   - Create document templates

3. **Development Phase:**
   - Set up monorepo structure
   - Implement authentication
   - Build core Sales module (with documents)
   - Build Stock module (with interest calculation)
   - Add analytics features
   - Add remaining modules

---

## 📞 Notes from Discussion (December 1, 2025)

### Confirmed Requirements

1. **Core Purpose:**
   - Digital transformation from paper-based to computerized system
   - Centralize ALL operations in one system
   - **Sales & Stock** are the two most important modules

2. **Document-Centric Approach:**
   - All 7 documents must be downloadable/printable
   - Documents accessed primarily from Sales module
   - User wants to download all related docs from one place

3. **Deep Analytics:**
   - Customer needs comprehensive business statistics
   - KPIs, trends, comparisons (MoM, YoY)
   - Performance tracking per salesperson

4. **7 Key Documents:**
   1. สัญญาจองรถยนต์ (Reservation Contract) - AcroForm
   2. ใบจอง ย่อ (Short Reservation Form) - pdfme
   3. การ์ดรายละเอียดรถยนต์ (Car Detail Card) - AcroForm
   4. หนังสือยืนยันการซื้อ-ขาย (Sales Confirmation) - pdfme
   5. ใบบันทึกการขาย (Sales Record) - pdfme
   6. ใบปล่อยรถ/ใบรับรถ (Delivery Receipt) - pdfme
   7. หนังสือขอบคุณ (Thank You Letter) - pdfme (existing)

5. **Brand:** VBeyond Innovation (Electric vehicles)

6. **Company Info:**
   ```
   บริษัท วีบียอนด์ อินโนเวชั่น จำกัด
   438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง
   อำเภอเมือง จังหวัดนครราชสีมา 30000
   โทร. 044-272-888 โทรสาร. 044-271-224
   ```

### Session 2 Clarifications (December 1, 2025)

| Item | Clarified Answer |
|------|------------------|
| Brand | **VBeyond** (not Chery) |
| Unified Sale Entity | **Yes** - Create one entity |
| Direct Sale | **Yes** - Simpler flow for walk-ins |
| Commission | **Fixed amount per car** |
| Digital Signatures | **Not required** |
| Letterhead | **Required** - Logo + company header |
| Dot Matrix | **Future** - For receipts only |
| PDF Method | **AcroForm (pdf-lib)** for contracts |
| KPIs/Targets | **TBD** - Leave for now |

### Session 3 Clarifications (December 1, 2025)

| Item | Clarified Answer |
|------|------------------|
| VIN = Chassis Number | **Yes** ✅ - Same value, use VIN field only |
| PREPARING trigger | **Auto** - When Sale is active AND Stock is assigned |
| Track maintenance/PDI | **No** ❌ - Not needed |
| Multiple warehouses | **No** ❌ - Single location only |
| Campaign purpose | **Analytics only** - No price effect |
| Campaign assignment | **Vehicle Models** - Not individual stocks |

### Remaining Minor Questions

- [ ] Commission fixed amount value (e.g., 5,000 THB?)
- [ ] Reservation expiration default period
- [ ] Manual discount approval workflow
- [ ] Vehicle model list for VBeyond

---

## 🚀 Ready to Start Development

With the current clarifications, we have enough to:

1. ✅ Set up the monorepo structure (React + ElysiaJS)
2. ✅ Create the unified Sale entity schema
3. ✅ Build the core Sales module with documents
4. ✅ Implement Stock module (VIN only, no chassis duplicate)
5. ✅ Stock status auto-transitions (PREPARING on assignment)
6. ✅ Set up PDF generation (pdf-lib + pdfme)
7. ✅ Campaign for analytics (Vehicle Model level)
8. ⏳ Analytics can be added incrementally
9. ⏳ Dot matrix receipt support later

---

## 📁 Moving to New Project

This document will be moved to the new project folder for implementation.

**New Project Location:** (To be created)
```
/Users/marwinropmuang/Documents/NexmindIT/VBeyond-Sales/
├── REQUIREMENTS_V2.md  ← This document
├── apps/
│   ├── web/           ← React Frontend
│   └── api/           ← ElysiaJS Backend
└── packages/
    └── shared/        ← Shared types & schemas
```

**Next Action:** Copy this document to new folder and start implementation!

---

*Document Version: 2.2*  
*Last Updated: December 1, 2025*  
*Status: ✅ Ready for Development*
