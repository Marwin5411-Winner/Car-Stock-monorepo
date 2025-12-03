import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { quotationService } from '../../services/quotation.service';
import type { Quotation, QuotationStats, QuotationStatus, QuotationFilters } from '../../services/quotation.service';
import { MainLayout } from '../../components/layout';
import { 
  Plus, 
  Search, 
  Eye, 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle,
  Send,
  ArrowRight,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableContainer,
  TableWrapper,
  TableEmpty,
  TableLoading,
  TablePagination,
} from '@/components/ui/table';

const STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'แบบร่าง',
  SENT: 'ส่งแล้ว',
  ACCEPTED: 'ซื้อ',
  REJECTED: 'ไม่ซื้อ',
  EXPIRED: 'หมดอายุ',
  CONVERTED: 'แปลงแล้ว',
};

const STATUS_COLORS: Record<QuotationStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SENT: 'bg-blue-100 text-blue-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-orange-100 text-orange-800',
  CONVERTED: 'bg-purple-100 text-purple-800',
};

const STATUS_ICONS: Record<QuotationStatus, React.ReactNode> = {
  DRAFT: <FileText className="h-4 w-4" />,
  SENT: <Send className="h-4 w-4" />,
  ACCEPTED: <CheckCircle className="h-4 w-4" />,
  REJECTED: <XCircle className="h-4 w-4" />,
  EXPIRED: <Clock className="h-4 w-4" />,
  CONVERTED: <ArrowRight className="h-4 w-4" />,
};

export default function QuotationListPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [stats, setStats] = useState<QuotationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | QuotationStatus>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;
  const navigate = useNavigate();

  const fetchQuotations = async () => {
    try {
      setLoading(true);
      const filters: QuotationFilters = { page, limit };
      if (searchTerm) filters.search = searchTerm;
      if (statusFilter !== 'ALL') filters.status = statusFilter;

      const response = await quotationService.getAll(filters);
      setQuotations(response.data || []);
      setTotalPages(response.meta?.totalPages || 1);
      setTotal(response.meta?.total || 0);
    } catch (error) {
      console.error('Error fetching quotations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await quotationService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchQuotations();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      setPage(1);
      fetchQuotations();
    }, 500);

    return () => clearTimeout(delayedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(dateString));
  };

  const getVehicleDisplay = (quotation: Quotation) => {
    if (quotation.vehicleModel) {
      return `${quotation.vehicleModel.brand} ${quotation.vehicleModel.model}${quotation.vehicleModel.variant ? ` ${quotation.vehicleModel.variant}` : ''}`;
    }
    return '-';
  };

  const isExpiringSoon = (validUntil: string) => {
    const expiryDate = new Date(validUntil);
    const today = new Date();
    const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 3 && diffDays > 0;
  };

  const isExpired = (validUntil: string, status: QuotationStatus) => {
    if (status === 'EXPIRED') return true;
    const expiryDate = new Date(validUntil);
    const today = new Date();
    return expiryDate < today && !['ACCEPTED', 'CONVERTED', 'REJECTED'].includes(status);
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">ใบเสนอราคา</h1>
          <Link
            to="/quotations/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            สร้างใบเสนอราคา
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-700">ทั้งหมด</p>
                <p className="text-xl font-bold text-gray-900">{stats?.totalQuotations || 0}</p>
              </div>
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-700">แบบร่าง</p>
                <p className="text-xl font-bold text-gray-700">{stats?.draftQuotations || 0}</p>
              </div>
              <FileText className="h-6 w-6 text-gray-400" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">ส่งแล้ว</p>
                <p className="text-xl font-bold text-blue-600">{stats?.sentQuotations || 0}</p>
              </div>
              <Send className="h-6 w-6 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">ยอมรับ</p>
                <p className="text-xl font-bold text-green-600">{stats?.acceptedQuotations || 0}</p>
              </div>
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">แปลงแล้ว</p>
                <p className="text-xl font-bold text-purple-600">{stats?.convertedQuotations || 0}</p>
              </div>
              <ArrowRight className="h-6 w-6 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">อัตราการแปลง</p>
                <p className="text-xl font-bold text-indigo-600">{stats?.conversionRate?.toFixed(1) || 0}%</p>
              </div>
              <TrendingUp className="h-6 w-6 text-indigo-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">มูลค่ารวม</p>
                <p className="text-lg font-bold text-blue-600">
                  {formatCurrency(stats?.totalQuotedValue || 0).replace('฿', '')}
                </p>
              </div>
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="ค้นหาเลขที่ใบเสนอราคา, ชื่อลูกค้า..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'ALL' | QuotationStatus);
                setPage(1);
              }}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            >
              <option value="ALL">ทุกสถานะ</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <TableContainer>
          {loading ? (
            <TableLoading />
          ) : quotations.length === 0 ? (
            <TableEmpty
              icon={<FileText className="h-12 w-12" />}
              title="ไม่พบข้อมูลใบเสนอราคา"
              action={
                <Link to="/quotations/new" className="text-blue-600 hover:underline">
                  สร้างใบเสนอราคาแรก
                </Link>
              }
            />
          ) : (
            <>
              <TableWrapper>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>เลขที่ใบเสนอราคา</TableHead>
                      <TableHead>ลูกค้า</TableHead>
                      <TableHead>รถยนต์</TableHead>
                      <TableHead>ราคา</TableHead>
                      <TableHead>วันหมดอายุ</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotations.map((quotation) => (
                      <TableRow key={quotation.id}>
                        <TableCell>
                          <Link
                            to={`/quotations/${quotation.id}`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {quotation.quotationNumber}
                          </Link>
                          {quotation.version > 1 && (
                            <span className="ml-2 text-xs text-gray-500">v{quotation.version}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-gray-900">{quotation.customer.name}</div>
                          <div className="text-sm text-gray-500">{quotation.customer.code}</div>
                        </TableCell>
                        <TableCell className="text-gray-900">
                          {getVehicleDisplay(quotation)}
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">
                          {formatCurrency(quotation.finalPrice)}
                          {quotation.discountAmount > 0 && (
                            <span className="ml-1 text-xs text-green-600">(-{formatCurrency(quotation.discountAmount)})</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className={`text-sm ${
                              isExpired(quotation.validUntil, quotation.status) 
                                ? 'text-red-600' 
                                : isExpiringSoon(quotation.validUntil) 
                                  ? 'text-orange-600' 
                                  : 'text-gray-600'
                            }`}>
                              {formatDate(quotation.validUntil)}
                            </span>
                            {isExpiringSoon(quotation.validUntil) && quotation.status === 'SENT' && (
                              <AlertCircle className="h-4 w-4 text-orange-500" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[quotation.status]}`}>
                            {STATUS_ICONS[quotation.status]}
                            {STATUS_LABELS[quotation.status]}
                          </span>
                          {quotation.sale && (
                            <Link
                              to={`/sales/${quotation.sale.id}`}
                              className="ml-2 text-xs text-purple-600 hover:underline"
                            >
                              → {quotation.sale.saleNumber}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={() => navigate(`/quotations/${quotation.id}`)}
                            className="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ดูรายละเอียด"
                          >
                            <Eye className="h-5 w-5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>

              {/* Pagination */}
              {totalPages > 1 && (
                <TablePagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  limit={limit}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </TableContainer>
      </div>
    </MainLayout>
  );
}
