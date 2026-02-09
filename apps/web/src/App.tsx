import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { CompanyProvider, useCompany } from './contexts/CompanyContext';
import React from 'react';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import CustomersListPage from './pages/customers/CustomersListPage';
import CustomerFormPage from './pages/customers/CustomerFormPage';
import CustomerDetailPage from './pages/customers/CustomerDetailPage';
import VehiclesListPage from './pages/vehicles/VehiclesListPage';
import VehicleFormPage from './pages/vehicles/VehicleFormPage';
import VehicleDetailPage from './pages/vehicles/VehicleDetailPage';
import StockListPage from './pages/stock/StockListPage';
import StockFormPage from './pages/stock/StockFormPage';
import StockDetailPage from './pages/stock/StockDetailPage';
import { InterestListPage, InterestDetailPage, InterestEditPage } from './pages/interest';
import SalesListPage from './pages/sales/SalesListPage';
import SalesFormPage from './pages/sales/SalesFormPage';
import SalesDetailPage from './pages/sales/SalesDetailPage';
import QuotationListPage from './pages/quotations/QuotationListPage';
import QuotationFormPage from './pages/quotations/QuotationFormPage';
import QuotationDetailPage from './pages/quotations/QuotationDetailPage';
import { PaymentsListPage, PaymentFormPage, PaymentDetailPage } from './pages/payments';
import { UsersListPage, UserFormPage, UserDetailPage } from './pages/users';
import { CampaignsListPage, CampaignFormPage, CampaignDetailPage, CampaignAnalyticsPage } from './pages/campaigns';
import {
  ReportsPage,
  DailyPaymentReportPage,
  StockReportPage,
  ProfitLossReportPage,
  SalesSummaryReportPage,
  StockInterestReportPage,
} from './pages/reports';
import SettingsPage from './pages/settings/SettingsPage';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const ROLE_ACCESS = {
  ADMIN_ONLY: ['ADMIN'] as const,
  CUSTOMER_VIEW: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'] as const,
  CUSTOMER_EDIT: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'] as const,
  VEHICLE_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'] as const,
  VEHICLE_EDIT: ['ADMIN', 'STOCK_STAFF'] as const,
  STOCK_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'] as const,
  STOCK_EDIT: ['ADMIN', 'STOCK_STAFF'] as const,
  INTEREST_VIEW: ['ADMIN', 'ACCOUNTANT', 'STOCK_STAFF'] as const,
  INTEREST_EDIT: ['ADMIN', 'ACCOUNTANT'] as const,
  SALES_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'] as const,
  SALES_CREATE: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'] as const,
  SALES_UPDATE: ['ADMIN'] as const,
  QUOTATION_EDIT: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'] as const,
  PAYMENTS_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'] as const,
  PAYMENTS_CREATE: ['ADMIN', 'ACCOUNTANT'] as const,
  CAMPAIGN_VIEW: ['ADMIN', 'SALES_MANAGER', 'ACCOUNTANT', 'SALES_STAFF'] as const,
  REPORTS_INDEX: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT'] as const,
  REPORT_FINANCE: ['ADMIN', 'ACCOUNTANT'] as const,
  REPORT_STOCK: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF'] as const,
  REPORT_SALES: ['ADMIN', 'SALES_MANAGER'] as const,
};

function TitleUpdater() {
  const { companyName } = useCompany();
  React.useEffect(() => {
    if (companyName) document.title = companyName;
  }, [companyName]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CompanyProvider>
        <TitleUpdater />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.CUSTOMER_VIEW}>
                  <CustomersListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/new"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.CUSTOMER_EDIT}>
                  <CustomerFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/:id"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.CUSTOMER_VIEW}>
                  <CustomerDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/:id/edit"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.CUSTOMER_EDIT}>
                  <CustomerFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.VEHICLE_VIEW}>
                  <VehiclesListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles/new"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.VEHICLE_EDIT}>
                  <VehicleFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles/:id"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.VEHICLE_VIEW}>
                  <VehicleDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles/:id/edit"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.VEHICLE_EDIT}>
                  <VehicleFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.STOCK_VIEW}>
                  <StockListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock/new"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.STOCK_EDIT}>
                  <StockFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock/:id"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.STOCK_VIEW}>
                  <StockDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock/:id/edit"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.STOCK_EDIT}>
                  <StockFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interest"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.INTEREST_VIEW}>
                  <InterestListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interest/:stockId"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.INTEREST_VIEW}>
                  <InterestDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interest/:stockId/edit"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.INTEREST_EDIT}>
                  <InterestEditPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.SALES_VIEW}>
                  <SalesListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/new"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.SALES_CREATE}>
                  <SalesFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/:id"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.SALES_VIEW}>
                  <SalesDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/:id/edit"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.SALES_UPDATE}>
                  <SalesFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.SALES_VIEW}>
                  <QuotationListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/new"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.QUOTATION_EDIT}>
                  <QuotationFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/:id"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.SALES_VIEW}>
                  <QuotationDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/:id/edit"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.QUOTATION_EDIT}>
                  <QuotationFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.PAYMENTS_VIEW}>
                  <PaymentsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments/new"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.PAYMENTS_CREATE}>
                  <PaymentFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments/:id"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.PAYMENTS_VIEW}>
                  <PaymentDetailPage />
                </ProtectedRoute>
              }
            />
            {/* User Management Routes - Admin Only */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.ADMIN_ONLY}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.ADMIN_ONLY}>
                  <UsersListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/new"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.ADMIN_ONLY}>
                  <UserFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:id"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.ADMIN_ONLY}>
                  <UserDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:id/edit"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.ADMIN_ONLY}>
                  <UserFormPage />
                </ProtectedRoute>
              }
            />
            {/* Campaign Management Routes - Admin Only */}
            <Route
              path="/campaigns"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.CAMPAIGN_VIEW}>
                  <CampaignsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/new"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.ADMIN_ONLY}>
                  <CampaignFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.CAMPAIGN_VIEW}>
                  <CampaignDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id/edit"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.ADMIN_ONLY}>
                  <CampaignFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id/analytics"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.ADMIN_ONLY}>
                  <CampaignAnalyticsPage />
                </ProtectedRoute>
              }
            />
            {/* Report Routes */}
            <Route
              path="/reports"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.REPORTS_INDEX}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/daily-payments"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.REPORT_FINANCE}>
                  <DailyPaymentReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/stock"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.REPORT_STOCK}>
                  <StockReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/profit-loss"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.REPORT_SALES}>
                  <ProfitLossReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/sales-summary"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.REPORT_SALES}>
                  <SalesSummaryReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/stock-interest"
              element={
                <ProtectedRoute allowedRoles={ROLE_ACCESS.INTEREST_VIEW}>
                  <StockInterestReportPage />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </CompanyProvider>
    </QueryClientProvider>
  );
}

export default App;
