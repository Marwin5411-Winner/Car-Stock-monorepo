import { api } from '../lib/api';
import type {
  DailyPaymentReportResponse,
  StockReportResponse,
  ProfitLossReportResponse,
  SalesSummaryReportResponse,
  StockInterestReportResponse,
  ReportQueryParams,
} from '@car-stock/shared/types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class ReportService {
  // ============================================
  // Daily Payment Report
  // ============================================
  async getDailyPaymentReport(params?: ReportQueryParams): Promise<DailyPaymentReportResponse> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const url = `/api/reports/daily-payments${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await api.get<ApiResponse<DailyPaymentReportResponse>>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch daily payment report');
    }

    return response.data;
  }

  // ============================================
  // Stock Report
  // ============================================
  async getStockReport(params?: ReportQueryParams): Promise<StockReportResponse> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.status) queryParams.append('status', params.status);

    const url = `/api/reports/stock${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await api.get<ApiResponse<StockReportResponse>>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch stock report');
    }

    return response.data;
  }

  // ============================================
  // Profit & Loss Report
  // ============================================
  async getProfitLossReport(params?: ReportQueryParams): Promise<ProfitLossReportResponse> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const url = `/api/reports/profit-loss${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await api.get<ApiResponse<ProfitLossReportResponse>>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch profit/loss report');
    }

    return response.data;
  }

  // ============================================
  // Sales Summary Report
  // ============================================
  async getSalesSummaryReport(params?: ReportQueryParams): Promise<SalesSummaryReportResponse> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.salespersonId) queryParams.append('salespersonId', params.salespersonId);

    const url = `/api/reports/sales-summary${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await api.get<ApiResponse<SalesSummaryReportResponse>>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch sales summary report');
    }

    return response.data;
  }

  // ============================================
  // Stock Interest Report
  // ============================================
  async getStockInterestReport(params?: ReportQueryParams): Promise<StockInterestReportResponse> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.brand) queryParams.append('brand', params.brand);
    if (params?.isCalculating !== undefined) {
      queryParams.append('isCalculating', String(params.isCalculating));
    }

    const url = `/api/reports/stock-interest${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await api.get<ApiResponse<StockInterestReportResponse>>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch stock interest report');
    }

    return response.data;
  }
}

export const reportService = new ReportService();
