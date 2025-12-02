import { api } from '../lib/api';

export interface VehicleModel {
  id: string;
  brand: string;
  model: string;
  variant?: string;
  year: number;
  type: string;
  primaryColor?: string;
  secondaryColor?: string;
  colorNotes?: string;
  mainOptions?: string;
  engineSpecs?: string;
  dimensions?: string;
  price: string | number;
  standardCost: string | number;
  targetMargin?: string | number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleData {
  brand: string;
  model: string;
  variant?: string;
  year: number;
  type: string;
  primaryColor?: string;
  secondaryColor?: string;
  colorNotes?: string;
  mainOptions?: string;
  engineSpecs?: string;
  dimensions?: string;
  price: number;
  standardCost: number;
  targetMargin?: number;
  notes?: string;
}

export interface UpdateVehicleData {
  brand?: string;
  model?: string;
  variant?: string;
  year?: number;
  type?: string;
  primaryColor?: string;
  secondaryColor?: string;
  colorNotes?: string;
  mainOptions?: string;
  engineSpecs?: string;
  dimensions?: string;
  price?: number;
  standardCost?: number;
  targetMargin?: number;
  notes?: string;
}

export interface VehicleFilters {
  page?: number;
  limit?: number;
  search?: string;
  brand?: string;
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
  meta?: PaginatedResponse<VehicleModel>['meta'];
}

class VehicleService {
  async getAll(filters: VehicleFilters = {}): Promise<PaginatedResponse<VehicleModel>> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.brand) params.append('brand', filters.brand);

    const response = await api.get<ApiResponse<VehicleModel[]>>(`/api/vehicles?${params.toString()}`);
    return {
      data: response.data,
      meta: response.meta!,
    };
  }

  async getById(id: string): Promise<VehicleModel> {
    const response = await api.get<ApiResponse<VehicleModel>>(`/api/vehicles/${id}`);
    return response.data;
  }

  async create(data: CreateVehicleData): Promise<VehicleModel> {
    const response = await api.post<ApiResponse<VehicleModel>>('/api/vehicles', data);
    return response.data;
  }

  async update(id: string, data: UpdateVehicleData): Promise<VehicleModel> {
    const response = await api.patch<ApiResponse<VehicleModel>>(`/api/vehicles/${id}`, data);
    return response.data;
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/api/vehicles/${id}`);
  }

  async getAvailable(): Promise<VehicleModel[]> {
    const response = await api.get<ApiResponse<VehicleModel[]>>('/api/vehicles/available');
    return response.data;
  }
}

export const vehicleService = new VehicleService();
