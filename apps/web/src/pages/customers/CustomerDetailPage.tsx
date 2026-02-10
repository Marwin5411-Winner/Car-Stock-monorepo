import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { customerService } from '../../services/customer.service';
import type { Customer } from '../../services/customer.service';
import { MainLayout } from '../../components/layout';
import { usePermission } from '../../hooks/usePermission';
import { ArrowLeft, Edit, User, Phone, Mail, MapPin, Calendar, FileText } from 'lucide-react';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  const { hasPermission } = usePermission();
  const canEdit = hasPermission('CUSTOMER_UPDATE');
  const canCreateSale = hasPermission('SALE_CREATE');
  const canCreatePayment = hasPermission('PAYMENT_CREATE');

  useEffect(() => {
    if (id) {
      fetchCustomer(id);
    }
  }, [id]);

  const fetchCustomer = async (customerId: string) => {
    try {
      setLoading(true);
      const data = await customerService.getById(customerId);
      setCustomer(data);
    } catch (error) {
      console.error('Error fetching customer:', error);
      alert('ไม่สามารถโหลดข้อมูลลูกค้าได้');
      navigate('/customers');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-700">กำลังโหลด...</p>
        </div>
      </MainLayout>
    );
  }

  if (!customer) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-gray-700">ไม่พบข้อมูลลูกค้า</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6">
        <button
          onClick={() => navigate('/customers')}
          className="inline-flex items-center text-gray-700 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          กลับ
        </button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            <p className="text-gray-700">{customer.code}</p>
          </div>
          {canEdit && (
            <Link
              to={`/customers/${customer.id}/edit`}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Edit className="w-5 h-5 mr-2" />
              แก้ไข
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">ข้อมูลทั่วไป</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start">
                <User className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-700">ประเภทลูกค้า</p>
                  <p className="text-gray-900">
                    {customer.type === 'INDIVIDUAL' ? 'บุคคลธรรมดา' : 'นิติบุคคล'}
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <CreditCard className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-700">ประเภทการขาย</p>
                  <p className="text-gray-900">
                    {customer.salesType === 'NORMAL_SALES' ? 'ขายปกติ' : 'ขายแบบ Fleets'}
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <User className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-700">ชื่อ-นามสกุล</p>
                  <p className="text-gray-900">{customer.name}</p>
                </div>
              </div>

              <div className="flex items-start">
                <Phone className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-700">เบอร์โทรศัพท์</p>
                  <p className="text-gray-900">{customer.phone}</p>
                </div>
              </div>

              {customer.email && (
                <div className="flex items-start">
                  <Mail className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                  <div>
                    <p className="text-sm text-gray-700">อีเมล</p>
                    <p className="text-gray-900">{customer.email}</p>
                  </div>
                </div>
              )}

              {customer.taxId && (
                <div className="flex items-start">
                  <FileText className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                  <div>
                    <p className="text-sm text-gray-700">เลขประจำตัวผู้เสียภาษี</p>
                    <p className="text-gray-900">{customer.taxId}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-700">วันที่สร้าง</p>
                  <p className="text-gray-900">
                    {new Date(customer.createdAt).toLocaleDateString('th-TH')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <MapPin className="h-5 w-5 mr-2" />
              ที่อยู่
            </h2>
            <div className="text-gray-900">
              <p>{customer.houseNumber}</p>
              {customer.street && <p>{customer.street}</p>}
              <p>
                แขวง/ตำบล {customer.subdistrict} เขต/อำเภอ {customer.district}
              </p>
              <p>
                จังหวัด {customer.province} {customer.postalCode}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">ประวัติการซื้อ</h2>
            <p className="text-gray-700 text-center py-8">
              ยังไม่มีประวัติการซื้อ
            </p>
          </div>
        </div>

        <div className="space-y-6">

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">การดำเนินการ</h2>
            <div className="space-y-2">
              {canCreateSale && (
                <Link
                  to={`/sales/new?customerId=${customer.id}`}
                  className="block w-full px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700"
                >
                  สร้างใบสั่งซื้อ
                </Link>
              )}
              {canCreatePayment && (
                <Link
                  to={`/payments/new?customerId=${customer.id}`}
                  className="block w-full px-4 py-2 bg-green-600 text-white text-center rounded-lg hover:bg-green-700"
                >
                  บันทึกการชำระ
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
