import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { userService } from '../../services/user.service';
import type { User } from '../../services/user.service';
import { MainLayout } from '../../components/layout';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Key,
  UserCog,
  Mail,
  Phone,
  Shield,
  Calendar,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { ROLE_LABELS } from '@car-stock/shared/constants';

const statusLabels: Record<string, string> = {
  ACTIVE: 'ใช้งาน',
  INACTIVE: 'ปิดใช้งาน',
};

const roleColors: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-800',
  SALES_MANAGER: 'bg-blue-100 text-blue-800',
  STOCK_STAFF: 'bg-yellow-100 text-yellow-800',
  ACCOUNTANT: 'bg-green-100 text-green-800',
  SALES_STAFF: 'bg-gray-100 text-gray-800',
};

export default function UserDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset password modal state
  const [showResetModal, setShowResetModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // Redirect non-admin users
  useEffect(() => {
    if (currentUser && currentUser.role !== 'ADMIN') {
      navigate('/dashboard');
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    if (id) {
      fetchUser(id);
    }
  }, [id]);

  const fetchUser = async (userId: string) => {
    try {
      setLoading(true);
      const response = await userService.getById(userId);
      if (response.success && response.data) {
        setUser(response.data);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      setError('ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;

    if (user.id === currentUser?.id) {
      alert('ไม่สามารถลบบัญชีของตัวเองได้');
      return;
    }

    if (!window.confirm(`คุณต้องการปิดใช้งานผู้ใช้ "${user.username}" หรือไม่?`)) {
      return;
    }

    try {
      await userService.delete(user.id);
      navigate('/users');
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('ไม่สามารถลบผู้ใช้ได้');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (newPassword.length < 6) {
      setResetError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('รหัสผ่านไม่ตรงกัน');
      return;
    }

    try {
      setResetting(true);
      await userService.resetPassword(user!.id, newPassword);
      setShowResetModal(false);
      setNewPassword('');
      setConfirmPassword('');
      alert('รีเซ็ตรหัสผ่านสำเร็จ');
    } catch (error) {
      console.error('Error resetting password:', error);
      setResetError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน');
    } finally {
      setResetting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (currentUser?.role !== 'ADMIN') {
    return null;
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">กำลังโหลด...</div>
        </div>
      </MainLayout>
    );
  }

  if (error || !user) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-red-500">{error || 'ไม่พบข้อมูลผู้ใช้'}</p>
          <button
            onClick={() => navigate('/users')}
            className="mt-4 text-blue-600 hover:text-blue-800"
          >
            กลับไปหน้ารายการ
          </button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/users')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            กลับไปหน้ารายการ
          </button>

          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <UserCog className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {user.firstName} {user.lastName}
                </h1>
                <p className="text-gray-500">@{user.username}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowResetModal(true)}
                className="inline-flex items-center px-4 py-2 border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <Key className="w-4 h-4 mr-2" />
                รีเซ็ตรหัสผ่าน
              </button>
              <Link
                to={`/users/${user.id}/edit`}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Edit className="w-4 h-4 mr-2" />
                แก้ไข
              </Link>
              {user.id !== currentUser?.id && (
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  ปิดใช้งาน
                </button>
              )}
            </div>
          </div>
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">ข้อมูลผู้ใช้</h2>
          </div>
          <div className="p-6 space-y-6">
            {/* Status & Role */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                {user.status === 'ACTIVE' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    user.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {statusLabels[user.status]}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-500" />
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    roleColors[user.role] || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]} ({user.role})
                </span>
              </div>
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">อีเมล</p>
                  <p className="font-medium">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">เบอร์โทรศัพท์</p>
                  <p className="font-medium">{user.phone || '-'}</p>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-6 pt-4 border-t">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">สร้างเมื่อ</p>
                  <p className="font-medium">{formatDate(user.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">อัปเดตล่าสุด</p>
                  <p className="font-medium">{formatDate(user.updatedAt)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reset Password Modal */}
        {showResetModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900">
                  รีเซ็ตรหัสผ่านสำหรับ @{user.username}
                </h3>
              </div>
              <form onSubmit={handleResetPassword} className="p-6">
                {resetError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {resetError}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      รหัสผ่านใหม่
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ยืนยันรหัสผ่านใหม่
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetModal(false);
                      setNewPassword('');
                      setConfirmPassword('');
                      setResetError(null);
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={resetting}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
                  >
                    {resetting ? 'กำลังรีเซ็ต...' : 'รีเซ็ตรหัสผ่าน'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
