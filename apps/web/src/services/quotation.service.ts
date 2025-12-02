import { api } from '../lib/api';

// Types
export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';

export interface Quotation {
  id: string;
  quotationNumber: string;
  version: number;
  status: QuotationStatus;
  
  // Customer
  customer: {
    id: string;
    code: string;
    name: string;
    type: string;
    phone?: string;
    email?: string;
  };
  
  // Vehicle Model preference
  vehicleModel?: {
    id: string;
    brand: string;
    model: string;
    variant?: string;
    year: number;
    type?: string;
    price?: number;
  };
  preferredExtColor?: string;
  preferredIntColor?: string;
  
  // Pricing
  quotedPrice: number;
  discountAmount: number;
  finalPrice: number;
  
  // Validity
  validUntil: string;
  
  notes?: string;
  
  // Linked sale (if converted)
  saleId?: string;
  sale?: {
    id: string;
    saleNumber: string;
    status: string;
  };
  
  createdBy?: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface QuotationStats {
  totalQuotations: number;
  draftQuotations: number;
  sentQuotations: number;
  acceptedQuotations: number;
  rejectedQuotations: number;
  expiredQuotations: number;
  convertedQuotations: number;
  conversionRate: number;
  totalQuotedValue: number;
}

export interface QuotationFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: QuotationStatus;
  customerId?: string;
}

export interface CreateQuotationData {
  customerId: string;
  vehicleModelId?: string;
  preferredExtColor?: string;
  preferredIntColor?: string;
  quotedPrice: number;
  discountAmount?: number;
  validUntil: Date | string;
  notes?: string;
}

export interface UpdateQuotationData extends Partial<CreateQuotationData> {
  status?: QuotationStatus;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

class QuotationService {
  /**
   * Get all quotations with pagination and filters
   */
  async getAll(filters: QuotationFilters = {}): Promise<{
    data: Quotation[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    if (filters.customerId) params.append('customerId', filters.customerId);

    const response = await api.get<ApiResponse<Quotation[]>>(`/api/quotations?${params.toString()}`);
    return {
      data: response.data,
      meta: response.meta || { total: 0, page: 1, limit: 20, totalPages: 0 },
    };
  }

  /**
   * Get quotation by ID
   */
  async getById(id: string): Promise<Quotation> {
    const response = await api.get<ApiResponse<Quotation>>(`/api/quotations/${id}`);
    return response.data;
  }

  /**
   * Create new quotation
   */
  async create(data: CreateQuotationData): Promise<Quotation> {
    const response = await api.post<ApiResponse<Quotation>>('/api/quotations', data);
    return response.data;
  }

  /**
   * Update quotation
   */
  async update(id: string, data: UpdateQuotationData): Promise<Quotation> {
    const response = await api.put<ApiResponse<Quotation>>(`/api/quotations/${id}`, data);
    return response.data;
  }

  /**
   * Update quotation status
   */
  async updateStatus(id: string, status: QuotationStatus): Promise<Quotation> {
    const response = await api.patch<ApiResponse<Quotation>>(`/api/quotations/${id}/status`, { status });
    return response.data;
  }

  /**
   * Convert quotation to sale
   */
  async convertToSale(id: string, data?: {
    saleType?: 'RESERVATION_SALE' | 'DIRECT_SALE';
    depositAmount?: number;
    stockId?: string;
    paymentMode?: 'CASH' | 'FINANCE' | 'MIXED';
    paymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'CHEQUE';
    paymentReferenceNumber?: string;
  }): Promise<{ quotation: Quotation; sale: { id: string; saleNumber: string; status: string } }> {
    const response = await api.post<ApiResponse<{ quotation: Quotation; sale: { id: string; saleNumber: string; status: string } }>>(`/api/quotations/${id}/convert`, data || {});
    return response.data;
  }

  /**
   * Create new version of quotation
   */
  async createNewVersion(id: string, data: Partial<CreateQuotationData>): Promise<Quotation> {
    const response = await api.post<ApiResponse<Quotation>>(`/api/quotations/${id}/new-version`, data);
    return response.data;
  }

  /**
   * Delete quotation (only DRAFT status)
   */
  async delete(id: string): Promise<void> {
    await api.delete(`/api/quotations/${id}`);
  }

  /**
   * Get quotation statistics
   */
  async getStats(): Promise<QuotationStats> {
    const response = await api.get<ApiResponse<QuotationStats>>('/api/quotations/stats');
    return response.data;
  }
}

export const quotationService = new QuotationService();
