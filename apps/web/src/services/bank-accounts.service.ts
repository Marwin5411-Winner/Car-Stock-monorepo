import { api } from '../lib/api';

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  branch?: string | null;
  accountType?: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export type BankAccountInput = Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class BankAccountsService {
  async list(includeInactive = false): Promise<ApiResponse<BankAccount[]>> {
    return api.get<ApiResponse<BankAccount[]>>(
      '/api/bank-accounts',
      includeInactive ? { includeInactive: 'true' } : undefined
    );
  }

  async create(data: BankAccountInput): Promise<ApiResponse<BankAccount>> {
    return api.post<ApiResponse<BankAccount>>('/api/bank-accounts', data);
  }

  async update(id: string, data: BankAccountInput): Promise<ApiResponse<BankAccount>> {
    return api.put<ApiResponse<BankAccount>>(`/api/bank-accounts/${id}`, data);
  }

  async remove(id: string): Promise<ApiResponse<void>> {
    return api.delete<ApiResponse<void>>(`/api/bank-accounts/${id}`);
  }
}

export const bankAccountsService = new BankAccountsService();
