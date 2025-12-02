import { api } from '../lib/api';

// Types
export interface InterestSummary {
  stockId: string;
  vin: string;
  vehicleModel: {
    brand: string;
    model: string;
    variant: string | null;
    year: number;
  };
  exteriorColor: string;
  status: 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD';
  orderDate: string | null;
  arrivalDate: string;
  interestStartDate: string; // วันที่เริ่มคิดดอกเบี้ย (orderDate หรือ arrivalDate)
  daysCount: number; // จำนวนวันที่คิดดอกเบี้ย
  currentRate: number;
  totalAccumulatedInterest: number;
  isCalculating: boolean;
  principalBase: 'BASE_COST_ONLY' | 'TOTAL_COST';
  principalAmount: number;
}

export interface InterestPeriod {
  id: string;
  startDate: string;
  endDate: string | null;
  annualRate: number;
  principalBase: 'BASE_COST_ONLY' | 'TOTAL_COST';
  principalAmount: number;
  calculatedInterest: number;
  daysCount: number;
  notes: string | null;
  createdAt: string;
  createdById: string | null;
}

export interface InterestDetail {
  stock: {
    id: string;
    vin: string;
    vehicleModel: {
      id: string;
      brand: string;
      model: string;
      variant: string | null;
      year: number;
      type: string;
    };
    exteriorColor: string;
    interiorColor: string | null;
    orderDate: string | null;
    arrivalDate: string;
    interestStartDate: string; // วันที่เริ่มคิดดอกเบี้ย
    status: 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD';
    baseCost: number;
    transportCost: number;
    accessoryCost: number;
    otherCosts: number;
    totalCost: number;
    interestPrincipalBase: 'BASE_COST_ONLY' | 'TOTAL_COST';
    financeProvider: string | null;
    stopInterestCalc: boolean;
    interestStoppedAt: string | null;
  };
  summary: {
    totalAccumulatedInterest: number;
    totalDays: number;
    periodCount: number;
    currentRate: number;
    isCalculating: boolean;
  };
  periods: InterestPeriod[];
}

export interface InterestStats {
  totalStocksWithInterest: number;
  activeCalculations: number;
  stoppedCalculations: number;
  totalAccumulatedInterest: number;
  averageRate: number;
}

export interface InterestFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD';
  isCalculating?: boolean;
}

export interface UpdateInterestRateData {
  annualRate: number;
  principalBase?: 'BASE_COST_ONLY' | 'TOTAL_COST';
  effectiveDate?: string;
  notes?: string;
}

export interface InitializeInterestData {
  annualRate: number;
  principalBase?: 'BASE_COST_ONLY' | 'TOTAL_COST';
  startDate?: string;
  notes?: string;
}

export interface ResumeInterestData {
  annualRate: number;
  principalBase?: 'BASE_COST_ONLY' | 'TOTAL_COST';
  notes?: string;
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
  meta?: PaginatedResponse<InterestSummary>['meta'];
  message?: string;
}

class InterestService {
  /**
   * Get all stock with interest summary
   */
  async getAll(filters: InterestFilters = {}): Promise<PaginatedResponse<InterestSummary>> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    if (filters.isCalculating !== undefined) {
      params.append('isCalculating', filters.isCalculating.toString());
    }

    const response = await api.get<ApiResponse<InterestSummary[]>>(`/api/interest?${params.toString()}`);
    return {
      data: response.data,
      meta: response.meta!,
    };
  }

  /**
   * Get interest statistics
   */
  async getStats(): Promise<InterestStats> {
    const response = await api.get<ApiResponse<InterestStats>>('/api/interest/stats');
    return response.data;
  }

  /**
   * Get interest detail for a specific stock
   */
  async getById(stockId: string): Promise<InterestDetail> {
    const response = await api.get<ApiResponse<InterestDetail>>(`/api/interest/${stockId}`);
    return response.data;
  }

  /**
   * Initialize interest period for a stock
   */
  async initialize(stockId: string, data: InitializeInterestData): Promise<InterestPeriod> {
    const response = await api.post<ApiResponse<InterestPeriod>>(`/api/interest/${stockId}/initialize`, data);
    return response.data;
  }

  /**
   * Update interest rate for a stock
   */
  async updateRate(stockId: string, data: UpdateInterestRateData): Promise<InterestPeriod> {
    const response = await api.put<ApiResponse<InterestPeriod>>(`/api/interest/${stockId}`, data);
    return response.data;
  }

  /**
   * Stop interest calculation for a stock
   */
  async stopCalculation(stockId: string, notes?: string): Promise<void> {
    await api.post(`/api/interest/${stockId}/stop`, notes ? { notes } : undefined);
  }

  /**
   * Resume interest calculation for a stock
   */
  async resumeCalculation(stockId: string, data: ResumeInterestData): Promise<InterestPeriod> {
    const response = await api.post<ApiResponse<InterestPeriod>>(`/api/interest/${stockId}/resume`, data);
    return response.data;
  }
}

export const interestService = new InterestService();
