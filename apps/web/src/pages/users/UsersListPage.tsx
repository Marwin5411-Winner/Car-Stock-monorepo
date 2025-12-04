import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { userService } from '../../services/user.service';
import type { User } from '../../services/user.service';
import { MainLayout } from '../../components/layout';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Search, Edit, Trash2, Eye, UserCog, Shield } from 'lucide-react';
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
import { ROLE_LABELS } from '@car-stock/shared/constants';

const statusLabels: Record<string, string> = {
  ACTIVE: 'ใช้งาน',
  INACTIVE: 'ปิดใช้งาน',
};

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-red-100 text-red-800',
};

const roleColors: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-800',
  SALES_MANAGER: 'bg-blue-100 text-blue-800',
  STOCK_STAFF: 'bg-yellow-100 text-yellow-800',
  ACCOUNTANT: 'bg-green-100 text-green-800',
  SALES_STAFF: 'bg-gray-100 text-gray-800',
};

export default function UsersListPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  // Redirect non-admin users
  useEffect(() => {
    if (currentUser && currentUser.role !== 'ADMIN') {
      navigate('/dashboard');
    }
  }, [currentUser, navigate]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const filters: Record<string, string | number> = {
        page,
        limit,
      };

      if (searchTerm) {
        filters.search = searchTerm;
      }

      const response = await userService.getAll(filters);
      setUsers(response?.data ?? []);
      setTotalPages(response?.meta?.totalPages ?? 1);
      setTotal(response?.meta?.total ?? 0);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchTerm !== undefined) {
        setPage(1);
        fetchUsers();
      }
    }, 500);

    return () => clearTimeout(delayedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const handleDelete = async (id: string, username: string) => {
    if (id === currentUser?.id) {
      alert('ไม่สามารถลบบัญชีของตัวเองได้');
      return;
    }

    if (!window.confirm(`คุณต้องการปิดใช้งานผู้ใช้ "${username}" หรือไม่?`)) {
      return;
    }

    try {
      await userService.delete(id);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('ไม่สามารถลบผู้ใช้ได้');
    }
  };

  if (currentUser?.role !== 'ADMIN') {
    return null;
  }

  return (
    <MainLayout>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-purple-600" />
            <h1 className="text-2xl font-bold text-gray-900">จัดการผู้ใช้งาน</h1>
          </div>
          <Link
            to="/users/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            เพิ่มผู้ใช้ใหม่
          </Link>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="ค้นหาด้วยชื่อผู้ใช้, อีเมล, ชื่อ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <TableContainer>
          <TableLoading />
        </TableContainer>
      ) : users.length === 0 ? (
        <TableContainer>
          <TableEmpty title="ไม่พบข้อมูลผู้ใช้" />
        </TableContainer>
      ) : (
        <TableContainer>
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อผู้ใช้</TableHead>
                  <TableHead>ชื่อ-นามสกุล</TableHead>
                  <TableHead>อีเมล</TableHead>
                  <TableHead>เบอร์โทร</TableHead>
                  <TableHead>บทบาท</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserCog className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{user.username}</span>
                        {user.id === currentUser?.id && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                            คุณ
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.firstName} {user.lastName}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.phone || '-'}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          roleColors[user.role] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          statusColors[user.status] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {statusLabels[user.status] || user.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/users/${user.id}`}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="ดูรายละเอียด"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          to={`/users/${user.id}/edit`}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="แก้ไข"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        {user.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDelete(user.id, user.username)}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                            title="ปิดใช้งาน"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
          />
        </TableContainer>
      )}
    </MainLayout>
  );
}
