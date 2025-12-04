import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '../../components/layout';
import { campaignService } from '../../services/campaign.service';
import { ArrowLeft, Edit, BarChart3, Calendar, Car, FileText } from 'lucide-react';

const statusColors = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ACTIVE: 'bg-green-100 text-green-800',
  ENDED: 'bg-red-100 text-red-800',
};

const statusLabels = {
  DRAFT: 'แบบร่าง',
  ACTIVE: 'กำลังดำเนินการ',
  ENDED: 'สิ้นสุดแล้ว',
};

export const CampaignDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignService.getById(id!),
    enabled: !!id,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="text-center py-8">กำลังโหลด...</div>
      </MainLayout>
    );
  }

  if (error || !campaign) {
    return (
      <MainLayout>
        <div className="text-center text-red-600 py-8">
          ไม่พบแคมเปญ
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/campaigns')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
              <p className="text-gray-600 mt-1">รายละเอียดแคมเปญ</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              to={`/campaigns/${id}/analytics`}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              <BarChart3 className="w-5 h-5" />
              ดูสถิติ
            </Link>
            <Link
              to={`/campaigns/${id}/edit`}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Edit className="w-5 h-5" />
              แก้ไข
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Campaign Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">ข้อมูลแคมเปญ</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 text-sm font-medium rounded-full ${
                      statusColors[campaign.status]
                    }`}
                  >
                    {statusLabels[campaign.status]}
                  </span>
                </div>

                {campaign.description && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">รายละเอียด</label>
                    <p className="text-gray-900 mt-1">{campaign.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">วันเริ่มต้น</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900">{formatDate(campaign.startDate)}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">วันสิ้นสุด</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900">{formatDate(campaign.endDate)}</span>
                    </div>
                  </div>
                </div>

                {campaign.notes && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">หมายเหตุ</label>
                    <p className="text-gray-900 mt-1">{campaign.notes}</p>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <div className="text-sm text-gray-500">
                    สร้างโดย: {campaign.createdBy.firstName} {campaign.createdBy.lastName}
                  </div>
                  <div className="text-sm text-gray-500">
                    สร้างเมื่อ: {formatDate(campaign.createdAt)}
                  </div>
                </div>
              </div>
            </div>

            {/* Vehicle Models */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  รุ่นรถยนต์ในแคมเปญ
                </h2>
                <span className="text-sm text-gray-500">
                  {campaign.vehicleModels.length} รุ่น
                </span>
              </div>

              {campaign.vehicleModels.length === 0 ? (
                <p className="text-gray-500 text-center py-4">ไม่มีรุ่นรถยนต์</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {campaign.vehicleModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Car className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {model.brand} {model.model}
                        </div>
                        <div className="text-sm text-gray-500">
                          {model.variant} • {model.year}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">สรุป</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <span className="text-gray-700">ยอดขาย</span>
                  </div>
                  <span className="text-xl font-bold text-blue-600">
                    {campaign.salesCount}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Car className="w-5 h-5 text-green-600" />
                    <span className="text-gray-700">รุ่นรถยนต์</span>
                  </div>
                  <span className="text-xl font-bold text-green-600">
                    {campaign.vehicleModels.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">การดำเนินการ</h2>
              <div className="space-y-3">
                <Link
                  to={`/campaigns/${id}/analytics`}
                  className="flex items-center gap-2 w-full px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                >
                  <BarChart3 className="w-5 h-5" />
                  ดูสถิติยอดขาย
                </Link>
                <Link
                  to={`/campaigns/${id}/edit`}
                  className="flex items-center gap-2 w-full px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  <Edit className="w-5 h-5" />
                  แก้ไขแคมเปญ
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default CampaignDetailPage;
