import { api } from '../lib/api';

export interface Stock {
  id: string;
  vin: string;
  engineNumber?: string;
  motorNumber1?: string;
  motorNumber2?: string;
  vehicleModel: {
    id: string;
    brand: string;
    model: string;
    variant?: string;
    year: number;
    type: string;
  };
  exteriorColor: string;
  interiorColor?: string;
  status: 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD' | 'DEMO';
  parkingSlot?: string;
  arrivalDate: string;
  orderDate?: string;
  baseCost: number;
  transportCost: number;
  accessoryCost: number;
  otherCosts: number;
  financeProvider?: string;
  interestRate: number;
  interestPrincipalBase: 'BASE_COST_ONLY' | 'TOTAL_COST';
  accumulatedInterest: number;
  financePaymentDate?: string;
  stopInterestCalc: boolean;
  interestStoppedAt?: string;
  expectedSalePrice?: number;
  actualSalePrice?: number;
  soldDate?: string;
  deliveryNotes?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  daysInStock?: number;
  calculatedInterest?: number;
}

export interface CreateStockData {
  vin: string;
  engineNumber?: string;
  motorNumber1?: string;
  motorNumber2?: string;
  vehicleModelId: string;
  exteriorColor: string;
  interiorColor?: string;
  arrivalDate: Date;
  orderDate?: Date;
  parkingSlot?: string;
  baseCost: number;
  transportCost: number;
  accessoryCost: number;
  otherCosts: number;
  financeProvider?: string;
  interestRate: number;
  interestPrincipalBase: 'BASE_COST_ONLY' | 'TOTAL_COST';
  expectedSalePrice?: number;
  notes?: string;
}

export interface UpdateStockData {
  engineNumber?: string;
  motorNumber1?: string;
  motorNumber2?: string;
  exteriorColor?: string;
  interiorColor?: string;
  arrivalDate?: Date;
  orderDate?: Date;
  parkingSlot?: string;
  baseCost?: number;
  transportCost?: number;
  accessoryCost?: number;
  otherCosts?: number;
  financeProvider?: string;
  interestRate?: number;
  interestPrincipalBase?: 'BASE_COST_ONLY' | 'TOTAL_COST';
  expectedSalePrice?: number;
  notes?: string;
}

export interface StockFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD' | 'DEMO';
  vehicleModelId?: string;
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

export interface StockStats {
  totalStock: number;
  availableStock: number;
  reservedStock: number;
  preparingStock: number;
  soldStock: number;
  totalValue: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginatedResponse<Stock>['meta'];
}

class StockService {
  async getAll(filters: StockFilters = {}): Promise<PaginatedResponse<Stock>> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    if (filters.vehicleModelId) params.append('vehicleModelId', filters.vehicleModelId);

    const response = await api.get<ApiResponse<Stock[]>>(`/api/stock?${params.toString()}`);
    return {
      data: response.data,
      meta: response.meta!,
    };
  }

  async getById(id: string): Promise<Stock> {
    const response = await api.get<ApiResponse<Stock>>(`/api/stock/${id}`);
    return response.data;
  }

  async create(data: CreateStockData): Promise<Stock> {
    const response = await api.post<ApiResponse<Stock>>('/api/stock', data);
    return response.data;
  }

  async update(id: string, data: UpdateStockData): Promise<Stock> {
    const response = await api.patch<ApiResponse<Stock>>(`/api/stock/${id}`, data);
    return response.data;
  }

  async updateStatus(id: string, status: string, notes?: string): Promise<Stock> {
    const response = await api.patch<ApiResponse<Stock>>(`/api/stock/${id}/status`, { status, notes });
    return response.data;
  }

  async recalculateInterest(id: string): Promise<Stock> {
    const response = await api.post<ApiResponse<Stock>>(`/api/stock/${id}/recalculate-interest`);
    return response.data;
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/api/stock/${id}`);
  }

  async getAvailable(): Promise<Stock[]> {
    const response = await api.get<ApiResponse<Stock[]>>('/api/stock/available');
    return response.data;
  }

  async getStats(): Promise<StockStats> {
    const response = await api.get<ApiResponse<StockStats>>('/api/stock/stats');
    return response.data;
  }
}

export const stockService = new StockService();
