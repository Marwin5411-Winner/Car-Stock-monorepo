import { api } from '../lib/api';

// Types
export type SaleType = 'RESERVATION_SALE' | 'DIRECT_SALE';
// Updated: Removed INQUIRY and QUOTED - these are now handled by Quotation module
export type SaleStatus = 'RESERVED' | 'PREPARING' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';
export type PaymentMode = 'CASH' | 'FINANCE' | 'MIXED';
export type RefundPolicy = 'FULL' | 'PARTIAL' | 'NO_REFUND';
export type PaymentType = 'DEPOSIT' | 'DOWN_PAYMENT' | 'FINANCE_PAYMENT' | 'OTHER_EXPENSE';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT_CARD';
export type PaymentStatus = 'ACTIVE' | 'VOIDED';

export interface Sale {
  id: string;
  saleNumber: string;
  type: SaleType;
  status: SaleStatus;
  customer: {
    id: string;
    code: string;
    name: string;
    type: string;
    phone?: string;
    email?: string;
  };
  stock?: {
    id: string;
    vin: string;
    vehicleModel: {
      brand: string;
      model: string;
      variant?: string;
    };
    exteriorColor?: string;
    interiorColor?: string;
  };
  vehicleModel?: {
    id: string;
    brand: string;
    model: string;
    variant?: string;
  };
  preferredExtColor?: string;
  preferredIntColor?: string;
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
  remainingAmount: number;
  reservedDate?: string;
  expirationDate?: string;
  hasExpiration?: boolean;
  deliveryDate?: string;
  completedDate?: string;
  campaign?: {
    id: string;
    name: string;
    description?: string;
  };
  discountSnapshot?: number;
  freebiesSnapshot?: string;
  paymentMode: PaymentMode;
  downPayment?: number;
  financeAmount?: number;
  financeProvider?: string;
  refundPolicy?: RefundPolicy;
  refundAmount?: number;
  notes?: string;
  cancellationReason?: string;
  createdBy?: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
  updatedAt?: string;
  payments?: Payment[];
  quotations?: Quotation[];
  history?: SaleHistory[];
}

export interface Payment {
  id: string;
  receiptNumber: string;
  amount: number;
  paymentDate: string;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  referenceNumber?: string;
  notes?: string;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  version: number;
  quotedPrice: number;
  status: string;
  validUntil: string;
  createdAt: string;
}

export interface SaleHistory {
  id: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  notes?: string;
  createdAt: string;
}

export interface CreateSaleData {
  type: SaleType;
  customerId: string;
  stockId?: string;
  vehicleModelId?: string;
  preferredExtColor?: string;
  preferredIntColor?: string;
  totalAmount: number;
  depositAmount?: number;
  expirationDate?: Date;
  hasExpiration?: boolean;
  campaignId?: string;
  discountSnapshot?: number;
  freebiesSnapshot?: string;
  paymentMode?: PaymentMode;
  downPayment?: number;
  financeAmount?: number;
  financeProvider?: string;
  refundPolicy?: RefundPolicy;
  notes?: string;
}

export interface UpdateSaleData {
  customerId?: string;
  stockId?: string;
  vehicleModelId?: string;
  preferredExtColor?: string;
  preferredIntColor?: string;
  totalAmount?: number;
  depositAmount?: number;
  expirationDate?: Date;
  hasExpiration?: boolean;
  campaignId?: string;
  discountSnapshot?: number;
  freebiesSnapshot?: string;
  paymentMode?: PaymentMode;
  downPayment?: number;
  financeAmount?: number;
  financeProvider?: string;
  refundPolicy?: RefundPolicy;
  notes?: string;
}

export interface SaleFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: SaleStatus;
  type?: SaleType;
  customerId?: string;
  createdById?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginatedResponse<Sale>['meta'];
}

// Updated: Removed inquirySales and quotedSales - now handled by Quotation module
export interface SalesStats {
  totalSales: number;
  reservedSales: number;
  preparingSales: number;
  deliveredSales: number;
  completedSales: number;
  cancelledSales: number;
  totalRevenue: number;
  totalPaid: number;
  totalRemaining: number;
}

class SalesService {
  async getAll(filters: SaleFilters = {}): Promise<PaginatedResponse<Sale>> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    if (filters.type) params.append('type', filters.type);
    if (filters.customerId) params.append('customerId', filters.customerId);
    if (filters.createdById) params.append('createdById', filters.createdById);

    const response = await api.get<ApiResponse<Sale[]>>(`/api/sales?${params.toString()}`);
    return {
      data: response.data,
      meta: response.meta!,
    };
  }

  async getById(id: string): Promise<Sale> {
    const response = await api.get<ApiResponse<Sale>>(`/api/sales/${id}`);
    return response.data;
  }

  async create(data: CreateSaleData): Promise<Sale> {
    const response = await api.post<ApiResponse<Sale>>('/api/sales', data);
    return response.data;
  }

  async update(id: string, data: UpdateSaleData): Promise<Sale> {
    const response = await api.patch<ApiResponse<Sale>>(`/api/sales/${id}`, data);
    return response.data;
  }

  async updateStatus(id: string, status: SaleStatus, notes?: string): Promise<Sale> {
    const response = await api.patch<ApiResponse<Sale>>(`/api/sales/${id}/status`, { status, notes });
    return response.data;
  }

  async assignStock(id: string, stockId: string): Promise<Sale> {
    const response = await api.patch<ApiResponse<Sale>>(`/api/sales/${id}/assign-stock`, { stockId });
    return response.data;
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/api/sales/${id}`);
  }

  async getStats(): Promise<SalesStats> {
    const response = await api.get<ApiResponse<SalesStats>>('/api/sales/stats');
    return response.data;
  }
}

export const salesService = new SalesService();
