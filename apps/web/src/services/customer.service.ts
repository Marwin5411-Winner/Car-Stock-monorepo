import { api } from '../lib/api';

export interface Customer {
  id: string;
  code: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  salesType: 'NORMAL_SALES' | 'FLEET_SALES';
  name: string;
  taxId?: string;
  houseNumber: string;
  street?: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode?: string;
  phone: string;
  email?: string;
  website?: string;
  contactName?: string;
  contactRole?: string;
  contactMobile?: string;
  contactEmail?: string;
  creditTermDays?: number;
  creditLimit?: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerData {
  type: 'INDIVIDUAL' | 'COMPANY';
  salesType: 'NORMAL_SALES' | 'FLEET_SALES';
  name: string;
  taxId?: string;
  houseNumber: string;
  street?: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode?: string;
  phone: string;
  email?: string;
  website?: string;
  contactName?: string;
  contactRole?: string;
  contactMobile?: string;
  contactEmail?: string;
  creditTermDays?: number;
  creditLimit?: number;
  notes?: string;
}

export interface UpdateCustomerData {
  type?: 'INDIVIDUAL' | 'COMPANY';
  salesType?: 'NORMAL_SALES' | 'FLEET_SALES';
  name?: string;
  taxId?: string;
  houseNumber?: string;
  street?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  contactName?: string;
  contactRole?: string;
  contactMobile?: string;
  contactEmail?: string;
  creditTermDays?: number;
  creditLimit?: number;
  status?: 'ACTIVE' | 'INACTIVE';
  notes?: string;
}

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE';
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

class CustomerService {
  async getAll(filters: CustomerFilters = {}): Promise<PaginatedResponse<Customer>> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);

    const response = await api.get<{ success: boolean; data: Customer[]; meta: PaginatedResponse<Customer>['meta'] }>(`/api/customers?${params.toString()}`);
    return {
      data: response.data,
      meta: response.meta,
    };
  }

  async getById(id: string): Promise<Customer> {
    const response = await api.get(`/api/customers/${id}`);
    return response.data;
  }

  async create(data: CreateCustomerData): Promise<Customer> {
    const response = await api.post('/api/customers', data);
    return response.data;
  }

  async update(id: string, data: UpdateCustomerData): Promise<Customer> {
    const response = await api.patch(`/api/customers/${id}`, data);
    return response.data;
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/api/customers/${id}`);
  }
}

export const customerService = new CustomerService();
