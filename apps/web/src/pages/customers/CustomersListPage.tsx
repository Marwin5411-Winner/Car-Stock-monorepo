import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { customerService } from '../../services/customer.service';
import type { Customer } from '../../services/customer.service';
import { MainLayout } from '../../components/layout';
import { Plus, Search, Edit, Trash2, User, Phone, Mail, CreditCard } from 'lucide-react';
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

export default function CustomersListPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  useEffect(() => {
    fetchCustomers();
  }, [page]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchTerm !== undefined) {
        setPage(1);
        fetchCustomers();
      }
    }, 500);

    return () => clearTimeout(delayedSearch);
  }, [searchTerm]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const filters: any = {
        page,
        limit,
      };

      if (searchTerm) {
        filters.search = searchTerm;
      }

      const response = await customerService.getAll(filters);
      setCustomers(response?.data ?? []);
      setTotalPages(response?.meta?.totalPages ?? 1);
      setTotal(response?.meta?.total ?? 0);
    } catch (error) {
      console.error('Error fetching customers:', error);
      setCustomers([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`คุณต้องการลบลูกค้า "${name}" หรือไม่?`)) {
      return;
    }

    try {
      await customerService.delete(id);
      fetchCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      alert('ไม่สามารถลบลูกค้าได้');
    }
  };

  return (
    <MainLayout>
    <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">จัดการลูกค้า</h1>
          <Link
            to="/customers/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            เพิ่มลูกค้าใหม่
          </Link>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาลูกค้า (ชื่อ, โทรศัพท์, อีเมล)"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <TableContainer>
          <TableLoading />
        </TableContainer>
      ) : (
        <>
          <TableContainer>
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ลูกค้า</TableHead>
                    <TableHead>ติดต่อ</TableHead>
                    <TableHead>วงเงินเครดิต</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="flex items-center">
                          <div className="shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <User className="h-5 w-5 text-blue-600" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {customer.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {customer.code}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-gray-900 flex items-center">
                          <Phone className="h-4 w-4 mr-2 text-gray-400" />
                          {customer.phone}
                        </div>
                        {customer.email && (
                          <div className="text-sm text-gray-500 flex items-center mt-1">
                            <Mail className="h-4 w-4 mr-2 text-gray-400" />
                            {customer.email}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-gray-900 flex items-center">
                          <CreditCard className="h-4 w-4 mr-2 text-gray-400" />
                          {new Intl.NumberFormat('th-TH', {
                            style: 'currency',
                            currency: 'THB',
                          }).format(customer.creditLimit ?? 0)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/customers/${customer.id}`}
                            className="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ดูรายละเอียด"
                          >
                            ดู
                          </Link>
                          <Link
                            to={`/customers/${customer.id}/edit`}
                            className="inline-flex items-center justify-center p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="แก้ไข"
                          >
                            <Edit className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(customer.id, customer.name)}
                            className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="ลบ"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>

            {customers.length === 0 && (
              <TableEmpty
                icon={<User className="h-12 w-12" />}
                title="ไม่พบลูกค้า"
                description="เริ่มต้นด้วยการเพิ่มลูกค้าใหม่"
              />
            )}

            {totalPages > 1 && (
              <TablePagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
              />
            )}
          </TableContainer>
        </>
      )}
    </MainLayout>
  );
}
