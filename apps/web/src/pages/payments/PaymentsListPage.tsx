import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { paymentService } from '../../services/payment.service';
import type { PaymentListItem, PaymentStats, PaymentStatus, PaymentType, PaymentFilters } from '../../services/payment.service';
import { MainLayout } from '../../components/layout';
import { 
  Plus, 
  Search, 
  CreditCard, 
  DollarSign, 
  TrendingUp,
  Ban,
  Receipt,
  Eye
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

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  DEPOSIT: 'เงินจอง',
  DOWN_PAYMENT: 'เงินดาวน์',
  FINANCE_PAYMENT: 'ยอดไฟแนนซ์',
  OTHER_EXPENSE: 'ค่าใช้จ่ายอื่น',
  MISCELLANEOUS: 'รายการทั่วไป',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'เงินสด',
  BANK_TRANSFER: 'โอนเงิน',
  CHEQUE: 'เช็ค',
  CREDIT_CARD: 'บัตรเครดิต',
};

const STATUS_COLORS: Record<PaymentStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  VOIDED: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  ACTIVE: 'ใช้งาน',
  VOIDED: 'ยกเลิก',
};

export default function PaymentsListPage() {
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | PaymentType>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;
  const [searchParams] = useSearchParams();
  const saleIdFilter = searchParams.get('saleId');

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const filters: PaymentFilters = { page, limit };
      if (searchTerm) filters.search = searchTerm;
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      if (typeFilter !== 'ALL') filters.paymentType = typeFilter;
      if (saleIdFilter) filters.saleId = saleIdFilter;

      const response = await paymentService.getAll(filters);

      setPayments(response?.data || []);
      setTotalPages(response?.meta?.totalPages || 1);
      setTotal(response?.meta?.total || 0);
    } catch (error) {
      console.error('Error fetching payments:', error);
      setPayments([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await paymentService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, typeFilter, saleIdFilter]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      setPage(1);
      fetchPayments();
    }, 500);

    return () => clearTimeout(delayedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(dateString));
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">การชำระเงิน</h1>
            {saleIdFilter && (
              <p className="text-sm text-gray-500 mt-1">
                กรองตามการขาย
                <Link to="/payments" className="text-blue-600 hover:underline ml-2">
                  ดูทั้งหมด
                </Link>
              </p>
            )}
          </div>
          <Link
            to="/payments/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            บันทึกการชำระเงิน
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">รายการทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.totalPayments || 0}</p>
              </div>
              <Receipt className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">ยอดรวม</p>
                <p className="text-xl font-bold text-green-600">
                  {stats ? new Intl.NumberFormat('th-TH', {
                    style: 'currency',
                    currency: 'THB',
                    notation: 'compact',
                  }).format(stats.totalAmount) : '฿0'}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">เงินจอง</p>
                <p className="text-xl font-bold text-yellow-600">
                  {stats ? new Intl.NumberFormat('th-TH', {
                    style: 'currency',
                    currency: 'THB',
                    notation: 'compact',
                  }).format(stats.depositAmount) : '฿0'}
                </p>
              </div>
              <CreditCard className="h-8 w-8 text-yellow-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">เงินดาวน์</p>
                <p className="text-xl font-bold text-purple-600">
                  {stats ? new Intl.NumberFormat('th-TH', {
                    style: 'currency',
                    currency: 'THB',
                    notation: 'compact',
                  }).format(stats.downPaymentAmount) : '฿0'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">ยกเลิก</p>
                <p className="text-2xl font-bold text-red-600">{stats?.voidedPayments || 0}</p>
              </div>
              <Ban className="h-8 w-8 text-red-600" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="ค้นหาเลขที่ใบเสร็จ, ลูกค้า, เลขที่ขาย..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'ALL' | PaymentStatus);
                setPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">สถานะทั้งหมด</option>
              <option value="ACTIVE">ใช้งาน</option>
              <option value="VOIDED">ยกเลิก</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as 'ALL' | PaymentType);
                setPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">ประเภททั้งหมด</option>
              <option value="DEPOSIT">เงินจอง</option>
              <option value="DOWN_PAYMENT">เงินดาวน์</option>
              <option value="FINANCE_PAYMENT">ยอดไฟแนนซ์</option>
              <option value="OTHER_EXPENSE">ค่าใช้จ่ายอื่น</option>
              <option value="MISCELLANEOUS">รายการทั่วไป</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <TableContainer>
          {loading ? (
            <TableLoading />
          ) : payments.length === 0 ? (
            <TableEmpty
              icon={<Receipt className="h-12 w-12" />}
              title="ไม่พบข้อมูลการชำระเงิน"
              description="เริ่มต้นด้วยการบันทึกการชำระเงินใหม่"
            />
          ) : (
            <>
              <TableWrapper>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>เลขที่ใบเสร็จ</TableHead>
                      <TableHead>ลูกค้า</TableHead>
                      <TableHead>เลขที่ขาย</TableHead>
                      <TableHead>ประเภท</TableHead>
                      <TableHead>วิธีชำระ</TableHead>
                      <TableHead>จำนวนเงิน</TableHead>
                      <TableHead>วันที่</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead className="text-right">การดำเนินการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <Link
                            to={`/payments/${payment.id}`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {payment.receiptNumber}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-gray-900">
                            {payment.customer.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {payment.customer.code}
                          </div>
                        </TableCell>
                        <TableCell>
                          {payment.sale ? (
                            <Link
                              to={`/sales/${payment.sale.id}`}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {payment.sale.saleNumber}
                            </Link>
                          ) : (
                            <span className="text-gray-400 italic">
                              {payment.description ? payment.description.substring(0, 30) + (payment.description.length > 30 ? '...' : '') : 'รายการทั่วไป'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-700">
                          {PAYMENT_TYPE_LABELS[payment.paymentType]}
                        </TableCell>
                        <TableCell className="text-gray-700">
                          {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                        <TableCell className="text-gray-500">
                          {formatDate(payment.paymentDate)}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[payment.status]}`}>
                            {STATUS_LABELS[payment.status]}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            to={`/payments/${payment.id}`}
                            className="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ดูรายละเอียด"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            ดู
                          </Link>
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
