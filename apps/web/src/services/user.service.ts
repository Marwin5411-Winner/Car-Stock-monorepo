import { api } from '../lib/api';

export type Role = 'ADMIN' | 'SALES_MANAGER' | 'STOCK_STAFF' | 'ACCOUNTANT' | 'SALES_STAFF';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
  status: UserStatus;
  profileImage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
}

export interface UpdateUserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: Role;
  status?: UserStatus;
  profileImage?: string;
}

export interface UserFilters {
  page?: number;
  limit?: number;
  search?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class UserService {
  async getAll(filters: UserFilters = {}): Promise<PaginatedResponse<User>> {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (filters.page) params.page = filters.page.toString();
    if (filters.limit) params.limit = filters.limit.toString();
    if (filters.search) params.search = filters.search;

    return api.get<PaginatedResponse<User>>('/api/users', params);
  }

  async getById(id: string): Promise<ApiResponse<User>> {
    return api.get<ApiResponse<User>>(`/api/users/${id}`);
  }

  async create(data: CreateUserData): Promise<ApiResponse<User>> {
    return api.post<ApiResponse<User>>('/api/users', data);
  }

  async update(id: string, data: UpdateUserData): Promise<ApiResponse<User>> {
    return api.patch<ApiResponse<User>>(`/api/users/${id}`, data);
  }

  async delete(id: string): Promise<ApiResponse<void>> {
    return api.delete<ApiResponse<void>>(`/api/users/${id}`);
  }

  async updatePassword(
    id: string,
    currentPassword: string,
    newPassword: string
  ): Promise<ApiResponse<void>> {
    return api.patch<ApiResponse<void>>(`/api/users/${id}/password`, {
      currentPassword,
      newPassword,
    });
  }

  async resetPassword(id: string, newPassword: string): Promise<ApiResponse<void>> {
    return api.patch<ApiResponse<void>>(`/api/users/${id}/reset-password`, {
      newPassword,
    });
  }
}

export const userService = new UserService();
