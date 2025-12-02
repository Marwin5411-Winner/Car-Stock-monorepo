import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../components/layout';
import { Button } from '../components/ui/button';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <MainLayout>
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h2>
              <p className="text-gray-600">ยินดีต้อนรับสู่ระบบจัดการขายรถยนต์ VBeyond</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">ภาพรวม Stock</h3>
                <p className="text-gray-600">จัดการคลังรถยนต์</p>
                <div className="mt-4 text-3xl font-bold text-blue-600">--</div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">การขาย</h3>
                <p className="text-gray-600">ติดตามการขายที่กำลังดำเนินการ</p>
                <div className="mt-4 text-3xl font-bold text-green-600">--</div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">รายได้รายเดือน</h3>
                <p className="text-gray-600">รายได้เดือนนี้</p>
                <div className="mt-4 text-3xl font-bold text-purple-600">--</div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">การดำเนินการด่วน</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/customers/new')}
                >
                  เพิ่มลูกค้า
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/sales/new')}
                >
                  ขายใหม่
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/stock/new')}
                >
                  เพิ่ม Stock
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/payments/new')}
                >
                  บันทึกการชำระ
                </Button>
              </div>
            </div>
    </MainLayout>
  );
};
