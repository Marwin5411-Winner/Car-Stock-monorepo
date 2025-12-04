import { api } from '../lib/api';

export interface VehicleModelSummary {
  id: string;
  brand: string;
  model: string;
  variant?: string;
  year: number;
  price?: string | number;
  type?: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'ENDED';
  startDate: string;
  endDate: string;
  notes?: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  vehicleModels: VehicleModelSummary[];
  salesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignData {
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  notes?: string;
  vehicleModelIds?: string[];
}

export interface UpdateCampaignData {
  name?: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ENDED';
  startDate?: string;
  endDate?: string;
  notes?: string;
  vehicleModelIds?: string[];
}

export interface CampaignAnalyticsItem {
  vehicleModelId: string;
  vehicleModel: {
    id: string;
    brand: string;
    model: string;
    variant?: string;
    year: number;
  };
  totalSales: number;
  totalAmount: number;
  directSales: number;
  reservationSales: number;
}

export interface CampaignAnalyticsSummary {
  totalVehicleModels: number;
  totalSales: number;
  totalAmount: number;
  directSales: number;
  reservationSales: number;
  periodStart: string;
  periodEnd: string;
}

export interface CampaignAnalytics {
  analytics: CampaignAnalyticsItem[];
  summary: CampaignAnalyticsSummary;
}

export interface CampaignFilters {
  page?: number;
  limit?: number;
  search?: string;
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
  meta?: PaginatedResponse<Campaign>['meta'];
  message?: string;
}

class CampaignService {
  async getAll(filters: CampaignFilters = {}): Promise<PaginatedResponse<Campaign>> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);

    const response = await api.get<ApiResponse<Campaign[]>>(`/api/campaigns?${params.toString()}`);
    return {
      data: response.data,
      meta: response.meta!,
    };
  }

  async getById(id: string): Promise<Campaign> {
    const response = await api.get<ApiResponse<Campaign>>(`/api/campaigns/${id}`);
    return response.data;
  }

  async getActiveCampaigns(): Promise<Campaign[]> {
    const response = await api.get<ApiResponse<Campaign[]>>('/api/campaigns/active');
    return response.data;
  }

  async create(data: CreateCampaignData): Promise<Campaign> {
    const response = await api.post<ApiResponse<Campaign>>('/api/campaigns', data);
    return response.data;
  }

  async update(id: string, data: UpdateCampaignData): Promise<Campaign> {
    const response = await api.put<ApiResponse<Campaign>>(`/api/campaigns/${id}`, data);
    return response.data;
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/api/campaigns/${id}`);
  }

  async getVehicleModels(campaignId: string): Promise<VehicleModelSummary[]> {
    const response = await api.get<ApiResponse<VehicleModelSummary[]>>(
      `/api/campaigns/${campaignId}/vehicle-models`
    );
    return response.data;
  }

  async addVehicleModel(campaignId: string, vehicleModelId: string): Promise<void> {
    await api.post(`/api/campaigns/${campaignId}/vehicle-models`, { vehicleModelId });
  }

  async removeVehicleModel(campaignId: string, vehicleModelId: string): Promise<void> {
    await api.delete(`/api/campaigns/${campaignId}/vehicle-models/${vehicleModelId}`);
  }

  async getAnalytics(
    campaignId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CampaignAnalytics> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await api.get<ApiResponse<CampaignAnalytics>>(
      `/api/campaigns/${campaignId}/analytics?${params.toString()}`
    );
    return response.data;
  }
}

export const campaignService = new CampaignService();
