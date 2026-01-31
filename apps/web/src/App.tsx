import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { CompanyProvider, useCompany } from './contexts/CompanyContext';
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
                <ProtectedRoute>
                  <CustomersListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/new"
              element={
                <ProtectedRoute>
                  <CustomerFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/:id"
              element={
                <ProtectedRoute>
                  <CustomerDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/:id/edit"
              element={
                <ProtectedRoute>
                  <CustomerFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles"
              element={
                <ProtectedRoute>
                  <VehiclesListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles/new"
              element={
                <ProtectedRoute>
                  <VehicleFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles/:id"
              element={
                <ProtectedRoute>
                  <VehicleDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicles/:id/edit"
              element={
                <ProtectedRoute>
                  <VehicleFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock"
              element={
                <ProtectedRoute>
                  <StockListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock/new"
              element={
                <ProtectedRoute>
                  <StockFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock/:id"
              element={
                <ProtectedRoute>
                  <StockDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock/:id/edit"
              element={
                <ProtectedRoute>
                  <StockFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interest"
              element={
                <ProtectedRoute>
                  <InterestListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interest/:stockId"
              element={
                <ProtectedRoute>
                  <InterestDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interest/:stockId/edit"
              element={
                <ProtectedRoute>
                  <InterestEditPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales"
              element={
                <ProtectedRoute>
                  <SalesListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/new"
              element={
                <ProtectedRoute>
                  <SalesFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/:id"
              element={
                <ProtectedRoute>
                  <SalesDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales/:id/edit"
              element={
                <ProtectedRoute>
                  <SalesFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations"
              element={
                <ProtectedRoute>
                  <QuotationListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/new"
              element={
                <ProtectedRoute>
                  <QuotationFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/:id"
              element={
                <ProtectedRoute>
                  <QuotationDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotations/:id/edit"
              element={
                <ProtectedRoute>
                  <QuotationFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments"
              element={
                <ProtectedRoute>
                  <PaymentsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments/new"
              element={
                <ProtectedRoute>
                  <PaymentFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments/:id"
              element={
                <ProtectedRoute>
                  <PaymentDetailPage />
                </ProtectedRoute>
              }
            />
            {/* User Management Routes - Admin Only */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute>
                  <UsersListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/new"
              element={
                <ProtectedRoute>
                  <UserFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:id"
              element={
                <ProtectedRoute>
                  <UserDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:id/edit"
              element={
                <ProtectedRoute>
                  <UserFormPage />
                </ProtectedRoute>
              }
            />
            {/* Campaign Management Routes - Admin Only */}
            <Route
              path="/campaigns"
              element={
                <ProtectedRoute>
                  <CampaignsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/new"
              element={
                <ProtectedRoute>
                  <CampaignFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id"
              element={
                <ProtectedRoute>
                  <CampaignDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id/edit"
              element={
                <ProtectedRoute>
                  <CampaignFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id/analytics"
              element={
                <ProtectedRoute>
                  <CampaignAnalyticsPage />
                </ProtectedRoute>
              }
            />
            {/* Report Routes */}
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/daily-payments"
              element={
                <ProtectedRoute>
                  <DailyPaymentReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/stock"
              element={
                <ProtectedRoute>
                  <StockReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/profit-loss"
              element={
                <ProtectedRoute>
                  <ProfitLossReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/sales-summary"
              element={
                <ProtectedRoute>
                  <SalesSummaryReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/stock-interest"
              element={
                <ProtectedRoute>
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
