import { api } from '../lib/api';

// Types
export type PaymentType = 'DEPOSIT' | 'DOWN_PAYMENT' | 'FINANCE_PAYMENT' | 'OTHER_EXPENSE' | 'MISCELLANEOUS';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT_CARD';
export type PaymentStatus = 'ACTIVE' | 'VOIDED';

export interface Payment {
  id: string;
  receiptNumber: string;
  amount: number;
  paymentDate: string;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  referenceNumber?: string;
  description?: string;
  voidReason?: string;
  voidedAt?: string;
  issuedBy?: string;
  customer: {
    id: string;
    code: string;
    name: string;
  };
  sale?: {
    id: string;
    saleNumber: string;
    totalAmount?: number;
    remainingAmount?: number;
  } | null;
  createdBy?: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

export interface PaymentListItem {
  id: string;
  receiptNumber: string;
  amount: number;
  paymentDate: string;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  referenceNumber?: string;
  description?: string;
  customer: {
    id: string;
    code: string;
    name: string;
  };
  sale?: {
    id: string;
    saleNumber: string;
  } | null;
  createdAt: string;
}

export interface CreatePaymentData {
  saleId?: string;
  customerId: string;
  amount: number;
  paymentDate: string;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  description?: string;
  notes?: string;
  receivingBank?: string;
  actualReceivedDate?: string;
  netReceivedAmount?: number;
}

export interface VoidPaymentData {
  voidReason: string;
}

export interface PaymentFilters {
  page?: number;
  limit?: number;
  search?: string;
  saleId?: string;
  customerId?: string;
  status?: PaymentStatus;
  paymentType?: PaymentType;
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

export interface PaymentStats {
  totalPayments: number;
  activePayments: number;
  voidedPayments: number;
  totalAmount: number;
  depositAmount: number;
  downPaymentAmount: number;
  financePaymentAmount: number;
  otherExpenseAmount: number;
}

export interface OutstandingPayment {
  sale: {
    id: string;
    saleNumber: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
    customer: {
      id: string;
      code: string;
      name: string;
    };
  };
  daysSinceReservation: number;
}

// API Response types
interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginatedResponse<T>['meta'];
}

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginatedResponse<T>['meta'];
}

class PaymentService {
  private baseUrl = '/api/payments';

  /**
   * Get all payments with filters
   */
  async getAll(filters: PaymentFilters = {}): Promise<PaginatedResponse<PaymentListItem>> {
    const params = new URLSearchParams();
    
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.saleId) params.append('saleId', filters.saleId);
    if (filters.customerId) params.append('customerId', filters.customerId);
    if (filters.status) params.append('status', filters.status);
    if (filters.paymentType) params.append('paymentType', filters.paymentType);
    
    const queryString = params.toString();
    const url = queryString ? `${this.baseUrl}?${queryString}` : this.baseUrl;
    
    const response = await api.get<ApiListResponse<PaymentListItem>>(url);
    return {
      data: response.data,
      meta: response.meta,
    };
  }

  /**
   * Get payment by ID
   */
  async getById(id: string): Promise<Payment> {
    const response = await api.get<ApiResponse<Payment>>(`${this.baseUrl}/${id}`);
    return response.data;
  }

  /**
   * Get payment statistics
   */
  async getStats(): Promise<PaymentStats> {
    const response = await api.get<ApiResponse<PaymentStats>>(`${this.baseUrl}/stats`);
    return response.data;
  }

  /**
   * Get outstanding payments (sales with remaining balance)
   */
  async getOutstanding(): Promise<OutstandingPayment[]> {
    const response = await api.get<ApiResponse<OutstandingPayment[]>>(`${this.baseUrl}/outstanding`);
    return response.data;
  }

  /**
   * Create new payment
   */
  async create(data: CreatePaymentData): Promise<Payment> {
    const response = await api.post<ApiResponse<Payment>>(this.baseUrl, data);
    return response.data;
  }

  /**
   * Void a payment
   */
  async void(id: string, data: VoidPaymentData): Promise<Payment> {
    const response = await api.patch<ApiResponse<Payment>>(`${this.baseUrl}/${id}/void`, data);
    return response.data;
  }

  /**
   * Download payment receipt PDF
   */
  async downloadReceipt(id: string): Promise<void> {
    try {
      const blob = await api.getBlob(`/api/pdf/temporary-receipt/${id}`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `temporary-receipt-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  }

  /**
   * Download payment receipt PDF with Background
   */
  async downloadReceiptBg(id: string): Promise<void> {
    try {
      const blob = await api.getBlob(`/api/pdf/temporary-receipt-bg/${id}`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `temporary-receipt-bg-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  }
}

export const paymentService = new PaymentService();
