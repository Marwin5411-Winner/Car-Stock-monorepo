import { z } from 'zod';

// ============================================
// Enums as Zod schemas
// ============================================

export const RoleSchema = z.enum([
  'ADMIN',
  'SALES_MANAGER',
  'STOCK_STAFF',
  'ACCOUNTANT',
  'SALES_STAFF',
]);

export const UserStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const CustomerTypeSchema = z.enum(['INDIVIDUAL', 'COMPANY']);

export const SalesTypeSchema = z.enum(['NORMAL_SALES', 'FLEET_SALES']);

export const VehicleTypeSchema = z.enum([
  'SUV',
  'SEDAN',
  'PICKUP',
  'HATCHBACK',
  'MPV',
  'EV',
]);

export const StockStatusSchema = z.enum([
  'AVAILABLE',
  'RESERVED',
  'PREPARING',
  'SOLD',
  'DEMO',
]);

export const InterestBaseSchema = z.enum(['BASE_COST_ONLY', 'TOTAL_COST']);

export const DebtStatusSchema = z.enum(['NO_DEBT', 'ACTIVE', 'PAID_OFF']);

export const SaleTypeSchema = z.enum(['RESERVATION_SALE', 'DIRECT_SALE']);

// Updated: Removed INQUIRY and QUOTED - these are now handled by Quotation module
export const SaleStatusSchema = z.enum([
  'RESERVED',
  'PREPARING',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
]);

export const PaymentModeSchema = z.enum(['CASH', 'FINANCE', 'MIXED']);

export const RefundPolicySchema = z.enum(['FULL', 'PARTIAL', 'NO_REFUND']);

export const PaymentTypeSchema = z.enum([
  'DEPOSIT',
  'DOWN_PAYMENT',
  'FINANCE_PAYMENT',
  'OTHER_EXPENSE',
  'MISCELLANEOUS',
]);

export const PaymentMethodSchema = z.enum([
  'CASH',
  'BANK_TRANSFER',
  'CHEQUE',
  'CREDIT_CARD',
]);

export const PaymentStatusSchema = z.enum(['ACTIVE', 'VOIDED']);

export const QuotationStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED',
]);

export const CampaignStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ENDED']);

export const DocumentTypeSchema = z.enum([
  'RESERVATION_CONTRACT',
  'SHORT_RESERVATION_FORM',
  'CAR_DETAIL_CARD',
  'SALES_CONFIRMATION',
  'SALES_RECORD',
  'DELIVERY_RECEIPT',
  'THANK_YOU_LETTER',
]);

// ============================================
// Auth Schemas
// ============================================

export const LoginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const RegisterSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
  role: RoleSchema.default('SALES_STAFF'),
});

// ============================================
// User Schemas
// ============================================

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  role: RoleSchema,
  status: UserStatusSchema,
  profileImage: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateUserSchema = RegisterSchema;

export const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  role: RoleSchema.optional(),
  status: UserStatusSchema.optional(),
  profileImage: z.string().optional(),
});

// ============================================
// Customer Schemas
// ============================================

export const CustomerSchema = z.object({
  id: z.string(),
  code: z.string(),
  type: CustomerTypeSchema,
  salesType: SalesTypeSchema,
  name: z.string(),
  taxId: z.string().nullable(),
  
  // Address (Thai structure)
  houseNumber: z.string(),
  street: z.string().nullable(),
  subdistrict: z.string(),
  district: z.string(),
  province: z.string(),
  postalCode: z.string().nullable(),
  
  // Contact
  phone: z.string(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  
  // Contact Person
  contactName: z.string().nullable(),
  contactRole: z.string().nullable(),
  contactMobile: z.string().nullable(),
  contactEmail: z.string().nullable(),
  
  // Credit
  creditTermDays: z.number().nullable(),
  creditLimit: z.number().nullable(),
  notes: z.string().nullable(),
  
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateCustomerSchema = z.object({
  type: CustomerTypeSchema,
  salesType: SalesTypeSchema.default('NORMAL_SALES'),
  name: z.string().min(1, 'Name is required'),
  taxId: z.string().optional(),
  
  // Address
  houseNumber: z.string().min(1, 'House number is required'),
  street: z.string().optional(),
  subdistrict: z.string().min(1, 'Subdistrict is required'),
  district: z.string().min(1, 'District is required'),
  province: z.string().min(1, 'Province is required'),
  postalCode: z.string().optional(),
  
  // Contact
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().optional(),
  
  // Contact Person
  contactName: z.string().optional(),
  contactRole: z.string().optional(),
  contactMobile: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  
  // Credit
  creditTermDays: z.number().optional(),
  creditLimit: z.number().optional(),
  notes: z.string().optional(),
});

export const UpdateCustomerSchema = CreateCustomerSchema.partial();

// ============================================
// Vehicle Model Schemas
// ============================================

export const VehicleModelSchema = z.object({
  id: z.string(),
  brand: z.string(),
  model: z.string(),
  variant: z.string().nullable(),
  year: z.number(),
  type: VehicleTypeSchema,
  
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  colorNotes: z.string().nullable(),
  
  mainOptions: z.string().nullable(),
  engineSpecs: z.string().nullable(),
  dimensions: z.string().nullable(),
  
  price: z.number(),
  standardCost: z.number(),
  targetMargin: z.number().nullable(),
  notes: z.string().nullable(),
  
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateVehicleModelSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  variant: z.string().optional(),
  year: z.number().min(2000).max(2100),
  type: VehicleTypeSchema,
  
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  colorNotes: z.string().optional(),
  
  mainOptions: z.string().optional(),
  engineSpecs: z.string().optional(),
  dimensions: z.string().optional(),
  
  price: z.number().positive('Price must be positive'),
  standardCost: z.number().positive('Standard cost must be positive'),
  targetMargin: z.number().optional(),
  notes: z.string().optional(),
});

export const UpdateVehicleModelSchema = CreateVehicleModelSchema.partial();

// ============================================
// Stock Schemas
// ============================================

export const StockSchema = z.object({
  id: z.string(),
  vin: z.string(),
  engineNumber: z.string().nullable(),
  motorNumber1: z.string().nullable(),
  motorNumber2: z.string().nullable(),
  
  vehicleModelId: z.string(),
  exteriorColor: z.string(),
  interiorColor: z.string().nullable(),
  
  arrivalDate: z.coerce.date(),
  orderDate: z.coerce.date().nullable(),
  status: StockStatusSchema,
  parkingSlot: z.string().nullable(),
  
  baseCost: z.number(),
  transportCost: z.number(),
  accessoryCost: z.number(),
  otherCosts: z.number(),
  financeProvider: z.string().nullable(),
  
  interestRate: z.number(),
  interestPrincipalBase: InterestBaseSchema,
  accumulatedInterest: z.number(),
  financePaymentDate: z.coerce.date().nullable(),
  stopInterestCalc: z.boolean(),
  interestStoppedAt: z.coerce.date().nullable(),
  
  expectedSalePrice: z.number().nullable(),
  actualSalePrice: z.number().nullable(),
  soldDate: z.coerce.date().nullable(),
  deliveryNotes: z.string().nullable(),
  notes: z.string().nullable(),
  
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});

export const CreateStockSchema = z.object({
  vin: z.string().min(1, 'VIN is required'),
  engineNumber: z.string().optional(),
  motorNumber1: z.string().optional(),
  motorNumber2: z.string().optional(),
  
  vehicleModelId: z.string().min(1, 'Vehicle model is required'),
  exteriorColor: z.string().min(1, 'Exterior color is required'),
  interiorColor: z.string().optional(),
  
  arrivalDate: z.coerce.date(),
  orderDate: z.coerce.date().optional(),
  parkingSlot: z.string().optional(),
  
  baseCost: z.coerce.number().positive('Base cost must be positive'),
  transportCost: z.coerce.number().min(0).default(0),
  accessoryCost: z.coerce.number().min(0).default(0),
  otherCosts: z.coerce.number().min(0).default(0),
  financeProvider: z.string().optional(),

  interestRate: z.coerce.number().min(0).default(0),
  interestPrincipalBase: InterestBaseSchema.default('BASE_COST_ONLY'),
  
  expectedSalePrice: z.coerce.number().positive().optional(),
  notes: z.string().optional(),
});

export const UpdateStockSchema = CreateStockSchema.partial();

// ============================================
// Sale Schemas
// ============================================

export const SaleSchema = z.object({
  id: z.string(),
  saleNumber: z.string(),
  type: SaleTypeSchema,
  status: SaleStatusSchema,
  
  customerId: z.string(),
  stockId: z.string().nullable(),
  vehicleModelId: z.string().nullable(),
  
  preferredExtColor: z.string().nullable(),
  preferredIntColor: z.string().nullable(),
  
  totalAmount: z.number(),
  depositAmount: z.number(),
  paidAmount: z.number(),
  remainingAmount: z.number(),
  
  reservedDate: z.coerce.date().nullable(),
  expirationDate: z.coerce.date().nullable(),
  hasExpiration: z.boolean(),
  deliveryDate: z.coerce.date().nullable(),
  completedDate: z.coerce.date().nullable(),
  
  campaignId: z.string().nullable(),
  discountSnapshot: z.number().nullable(),
  freebiesSnapshot: z.string().nullable(),
  
  paymentMode: PaymentModeSchema,
  downPayment: z.number().nullable(),
  financeAmount: z.number().nullable(),
  financeProvider: z.string().nullable(),
  
  refundPolicy: RefundPolicySchema,
  refundAmount: z.number().nullable(),
  
  notes: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  
  createdById: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateSaleSchema = z.object({
  type: SaleTypeSchema,
  customerId: z.string().min(1, 'Customer is required'),
  stockId: z.string().optional(),
  vehicleModelId: z.string().optional(),
  
  preferredExtColor: z.string().optional(),
  preferredIntColor: z.string().optional(),
  
  totalAmount: z.number().positive('Total amount must be positive'),
  depositAmount: z.number().min(0).default(0),
  
  expirationDate: z.coerce.date().optional(),
  hasExpiration: z.boolean().default(false),
  
  campaignId: z.string().optional(),
  discountSnapshot: z.number().optional(),
  freebiesSnapshot: z.string().optional(),
  
  paymentMode: PaymentModeSchema.default('CASH'),
  downPayment: z.number().optional(),
  financeAmount: z.number().optional(),
  financeProvider: z.string().optional(),
  
  refundPolicy: RefundPolicySchema.default('FULL'),
  notes: z.string().optional(),
});

export const UpdateSaleSchema = CreateSaleSchema.partial();

// ============================================
// Payment Schemas
// ============================================

export const PaymentSchema = z.object({
  id: z.string(),
  receiptNumber: z.string(),
  
  customerId: z.string(),
  saleId: z.string().nullable(),
  description: z.string().nullable(),
  
  paymentDate: z.coerce.date(),
  paymentType: PaymentTypeSchema,
  amount: z.number(),
  paymentMethod: PaymentMethodSchema,
  referenceNumber: z.string().nullable(),
  notes: z.string().nullable(),
  
  status: PaymentStatusSchema,
  voidReason: z.string().nullable(),
  voidedAt: z.coerce.date().nullable(),
  
  issuedBy: z.string(),
  createdById: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreatePaymentSchema = z.object({
  saleId: z.string().optional(),
  customerId: z.string().min(1, 'Customer is required'),
  description: z.string().optional(),
  
  paymentDate: z.coerce.date().default(() => new Date()),
  paymentType: PaymentTypeSchema,
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: PaymentMethodSchema,
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

export const VoidPaymentSchema = z.object({
  voidReason: z.string().min(1, 'Void reason is required'),
});

// ============================================
// Campaign Schemas
// ============================================

export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: CampaignStatusSchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  notes: z.string().nullable(),
  createdById: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateCampaignSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  status: CampaignStatusSchema.default('DRAFT'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  notes: z.string().optional(),
  vehicleModelIds: z.array(z.string()).default([]),
});

export const UpdateCampaignSchema = CreateCampaignSchema.partial();

// ============================================
// Quotation Schemas
// ============================================

export const QuotationSchema = z.object({
  id: z.string(),
  quotationNumber: z.string(),
  saleId: z.string(),
  version: z.number(),
  quotedPrice: z.number(),
  validUntil: z.coerce.date(),
  status: QuotationStatusSchema,
  notes: z.string().nullable(),
  createdById: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateQuotationSchema = z.object({
  saleId: z.string().min(1, 'Sale is required'),
  quotedPrice: z.number().positive('Quoted price must be positive'),
  validUntil: z.coerce.date(),
  notes: z.string().optional(),
});

// ============================================
// Query/Filter Schemas
// ============================================

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const CustomerFilterSchema = PaginationSchema.extend({
  search: z.string().optional(),
  type: CustomerTypeSchema.optional(),
  salesType: SalesTypeSchema.optional(),
});

export const StockFilterSchema = PaginationSchema.extend({
  search: z.string().optional(),
  status: StockStatusSchema.optional(),
  vehicleModelId: z.string().optional(),
});

export const SaleFilterSchema = PaginationSchema.extend({
  search: z.string().optional(),
  status: SaleStatusSchema.optional(),
  type: SaleTypeSchema.optional(),
  customerId: z.string().optional(),
  createdById: z.string().optional(),
});

export const PaymentFilterSchema = PaginationSchema.extend({
  saleId: z.string().optional(),
  customerId: z.string().optional(),
  status: PaymentStatusSchema.optional(),
  paymentType: PaymentTypeSchema.optional(),
});
