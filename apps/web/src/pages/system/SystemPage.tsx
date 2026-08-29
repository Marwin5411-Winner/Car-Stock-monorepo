import { MainLayout } from '../../components/layout';
import SystemUpdateSection from '../settings/SystemUpdateSection';

export default function SystemPage() {
  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">อัพเดทระบบ</h1>
        <p className="text-gray-600 mt-1">ดูเวอร์ชันปัจจุบัน สำรองข้อมูล และอัพเดทระบบ</p>
      </div>
      <div className="max-w-4xl">
        <SystemUpdateSection />
      </div>
    </MainLayout>
  );
}
