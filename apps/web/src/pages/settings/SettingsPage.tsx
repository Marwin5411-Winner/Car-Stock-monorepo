import { useState, useEffect } from 'react';
import { MainLayout } from '../../components/layout';
import { Save, Upload, Building } from 'lucide-react';
import { settingsService } from '../../services/settings.service';

export default function SettingsPage() {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        companyNameTh: '',
        companyNameEn: '',
        taxId: '',
        addressTh: '',
        addressEn: '',
        phone: '',
        mobile: '',
        fax: '',
        email: '',
        website: '',
        logo: '',
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const response = await settingsService.getSettings();
            if (response.success && response.data) {
                setFormData({
                    companyNameTh: response.data.companyNameTh || '',
                    companyNameEn: response.data.companyNameEn || '',
                    taxId: response.data.taxId || '',
                    addressTh: response.data.addressTh || '',
                    addressEn: response.data.addressEn || '',
                    phone: response.data.phone || '',
                    mobile: response.data.mobile || '',
                    fax: response.data.fax || '',
                    email: response.data.email || '',
                    website: response.data.website || '',
                    logo: response.data.logo || '',
                });
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            // Don't alert on first load if empty, just stay empty
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                alert('File size too large. Max 5MB.');
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, logo: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await settingsService.updateSettings(formData);
            alert('บันทึกการตั้งค่าสำเร็จ / Settings saved successfully');
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('เกิดข้อผิดพลาดในการบันทึก / Error saving settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <MainLayout>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Building className="w-6 h-6" />
                    ตั้งค่าบริษัท (Company Settings)
                </h1>
                <p className="text-gray-500 mt-1">จัดการข้อมูลบริษัทสำหรับการออกเอกสาร</p>
            </div>

            <form onSubmit={handleSubmit} className="max-w-4xl space-y-6 pb-12">
                {/* Branding & Logo */}
                <section className="bg-white border border-gray-200 rounded-xl p-6 lg:p-8 space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 border-b pb-2">โลโก้และชื่อบริษัท (Branding)</h2>

                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        <div className="w-full md:w-1/3 flex flex-col items-center gap-4">
                            <div className="w-40 h-40 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50 relative">
                                {formData.logo ? (
                                    <img src={formData.logo} alt="Company Logo" className="w-full h-full object-contain" />
                                ) : (
                                    <span className="text-gray-400 text-sm">No Logo</span>
                                )}
                            </div>
                            <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2">
                                <Upload className="w-4 h-4" />
                                อัพโหลดโลโก้
                                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                            </label>
                            <p className="text-xs text-gray-500">Recommended: PNG/JPG, Max 5MB</p>
                        </div>

                        <div className="w-full md:w-2/3 grid gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name (Thai) *</label>
                                <input
                                    type="text" name="companyNameTh" value={formData.companyNameTh} onChange={handleChange} required
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name (English) *</label>
                                <input
                                    type="text" name="companyNameEn" value={formData.companyNameEn} onChange={handleChange} required
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID / เลขประจำตัวผู้เสียภาษี *</label>
                                <input
                                    type="text" name="taxId" value={formData.taxId} onChange={handleChange} required
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Contact Info */}
                <section className="bg-white border border-gray-200 rounded-xl p-6 lg:p-8 space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 border-b pb-2">ที่อยู่และข้อมูลติดต่อ (Address & Contact)</h2>

                    <div className="grid gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Address (Thai) *</label>
                            <textarea
                                name="addressTh" value={formData.addressTh} onChange={handleChange} required rows={3}
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Address (English) *</label>
                            <textarea
                                name="addressEn" value={formData.addressEn} onChange={handleChange} required rows={3}
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                                <input
                                    type="text" name="phone" value={formData.phone} onChange={handleChange} required
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fax</label>
                                <input
                                    type="text" name="fax" value={formData.fax} onChange={handleChange}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                                <input
                                    type="text" name="mobile" value={formData.mobile} onChange={handleChange}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    type="email" name="email" value={formData.email} onChange={handleChange}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                                <input
                                    type="url" name="website" value={formData.website} onChange={handleChange}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Action Buttons */}
                <div className="flex justify-end pt-4">
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm transition-all"
                    >
                        <Save className="w-5 h-5" />
                        {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                    </button>
                </div>
            </form>
        </MainLayout>
    );
}
