import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { CompanyProvider, useCompany } from './contexts/CompanyContext';
import React from 'react';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, ToastContainer } from './components/toast';
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
  PurchaseRequirementReportPage,
} from './pages/reports';
import SettingsPage from './pages/settings/SettingsPage';
import { PERMISSIONS } from '@car-stock/shared/constants';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const P = PERMISSIONS;

function TitleUpdater() {
  const { companyName } = useCompany();
  React.useEffect(() => {
    if (companyName) document.title = companyName;
  }, [companyName]);
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <CompanyProvider>
            <TitleUpdater />
            <BrowserRouter>
              <AuthProvider>
                <ToastContainer />
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
                <ProtectedRoute allowedRoles={P.CUSTOMER_VIEW}>
                  <CustomersListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/new"
              element={
                <ProtectedRoute allowedRoles={P.CUSTOMER_UPDATE}>
                  <CustomerFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/:id"
              element={
                <ProtectedRoute allowedRoles={P.CUSTOMER_VIEW}>
                  <CustomerDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/:id/edit"
              element={
                <ProtectedRoute allowedRoles={P.CUSTOMER_UPDATE}>
                  <CustomerFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles"
              element={
                <ProtectedRoute allowedRoles={P.VEHICLE_VIEW}>
                  <VehiclesListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles/new"
              element={
                <ProtectedRoute allowedRoles={P.VEHICLE_EDIT}>
                  <VehicleFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles/:id"
              element={
                <ProtectedRoute allowedRoles={P.VEHICLE_VIEW}>
                  <VehicleDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles/:id/edit"
              element={
                <ProtectedRoute allowedRoles={P.VEHICLE_EDIT}>
                  <VehicleFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock"
              element={
                <ProtectedRoute allowedRoles={P.STOCK_VIEW}>
                  <StockListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock/new"
              element={
                <ProtectedRoute allowedRoles={P.STOCK_CREATE}>
                  <StockFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock/:id"
              element={
                <ProtectedRoute allowedRoles={P.STOCK_VIEW}>
                  <StockDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock/:id/edit"
              element={
                <ProtectedRoute allowedRoles={P.STOCK_UPDATE}>
                  <StockFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interest"
              element={
                <ProtectedRoute allowedRoles={P.INTEREST_VIEW}>
                  <InterestListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interest/:stockId"
              element={
                <ProtectedRoute allowedRoles={P.INTEREST_VIEW}>
                  <InterestDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interest/:stockId/edit"
              element={
                <ProtectedRoute allowedRoles={P.INTEREST_UPDATE}>
                  <InterestEditPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales"
              element={
                <ProtectedRoute allowedRoles={P.SALE_VIEW}>
                  <SalesListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/new"
              element={
                <ProtectedRoute allowedRoles={P.SALE_CREATE}>
                  <SalesFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/:id"
              element={
                <ProtectedRoute allowedRoles={P.SALE_VIEW}>
                  <SalesDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/:id/edit"
              element={
                <ProtectedRoute allowedRoles={P.SALE_UPDATE}>
                  <SalesFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations"
              element={
                <ProtectedRoute allowedRoles={P.SALE_VIEW}>
                  <QuotationListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/new"
              element={
                <ProtectedRoute allowedRoles={P.QUOTATION_CREATE}>
                  <QuotationFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/:id"
              element={
                <ProtectedRoute allowedRoles={P.SALE_VIEW}>
                  <QuotationDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/:id/edit"
              element={
                <ProtectedRoute allowedRoles={P.QUOTATION_UPDATE}>
                  <QuotationFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments"
              element={
                <ProtectedRoute allowedRoles={P.PAYMENT_VIEW}>
                  <PaymentsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments/new"
              element={
                <ProtectedRoute allowedRoles={P.PAYMENT_CREATE}>
                  <PaymentFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments/:id"
              element={
                <ProtectedRoute allowedRoles={P.PAYMENT_VIEW}>
                  <PaymentDetailPage />
                </ProtectedRoute>
              }
            />
            {/* User Management Routes - Admin Only */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowedRoles={P.SETTINGS_VIEW}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={P.USER_VIEW}>
                  <UsersListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/new"
              element={
                <ProtectedRoute allowedRoles={P.USER_CREATE}>
                  <UserFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:id"
              element={
                <ProtectedRoute allowedRoles={P.USER_VIEW}>
                  <UserDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:id/edit"
              element={
                <ProtectedRoute allowedRoles={P.USER_UPDATE}>
                  <UserFormPage />
                </ProtectedRoute>
              }
            />
            {/* Campaign Management Routes - Admin Only */}
            <Route
              path="/campaigns"
              element={
                <ProtectedRoute allowedRoles={P.CAMPAIGN_VIEW}>
                  <CampaignsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/new"
              element={
                <ProtectedRoute allowedRoles={P.CAMPAIGN_CREATE}>
                  <CampaignFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id"
              element={
                <ProtectedRoute allowedRoles={P.CAMPAIGN_VIEW}>
                  <CampaignDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id/edit"
              element={
                <ProtectedRoute allowedRoles={P.CAMPAIGN_UPDATE}>
                  <CampaignFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id/analytics"
              element={
                <ProtectedRoute allowedRoles={P.CAMPAIGN_VIEW}>
                  <CampaignAnalyticsPage />
                </ProtectedRoute>
              }
            />
            {/* Report Routes */}
            <Route
              path="/reports"
              element={
                <ProtectedRoute allowedRoles={P.REPORTS_INDEX}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/daily-payments"
              element={
                <ProtectedRoute allowedRoles={P.REPORT_FINANCE}>
                  <DailyPaymentReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/stock"
              element={
                <ProtectedRoute allowedRoles={P.REPORT_STOCK}>
                  <StockReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/profit-loss"
              element={
                <ProtectedRoute allowedRoles={P.REPORT_SALES}>
                  <ProfitLossReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/sales-summary"
              element={
                <ProtectedRoute allowedRoles={P.REPORT_SALES}>
                  <SalesSummaryReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/stock-interest"
              element={
                <ProtectedRoute allowedRoles={P.INTEREST_VIEW}>
                  <StockInterestReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/purchase-requirement"
              element={
                <ProtectedRoute allowedRoles={P.REPORT_STOCK}>
                  <PurchaseRequirementReportPage />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </CompanyProvider>
    </ToastProvider>
  </QueryClientProvider>
</ErrorBoundary>
  );
}

export default App;
