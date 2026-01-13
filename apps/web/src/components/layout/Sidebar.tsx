import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Users,
  Car,
  Package,
  ShoppingCart,
  CreditCard,
  BarChart3,
  FileText,
  Percent,
  Shield,
  Megaphone,
  PieChart,
  Settings
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <BarChart3 className="w-5 h-5" /> },
  { to: '/customers', label: 'ลูกค้า', icon: <Users className="w-5 h-5" /> },
  { to: '/vehicles', label: 'รุ่นรถยนต์', icon: <Car className="w-5 h-5" /> },
  { to: '/stock', label: 'Stock', icon: <Package className="w-5 h-5" /> },
  { to: '/interest', label: 'ดอกเบี้ย Stock', icon: <Percent className="w-5 h-5" /> },
  { to: '/quotations', label: 'ใบเสนอราคา', icon: <FileText className="w-5 h-5" /> },
  { to: '/sales', label: 'การขาย', icon: <ShoppingCart className="w-5 h-5" /> },
  { to: '/payments', label: 'การชำระเงิน', icon: <CreditCard className="w-5 h-5" /> },
  { to: '/reports', label: 'รายงาน', icon: <PieChart className="w-5 h-5" /> },
  { to: '/campaigns', label: 'แคมเปญ', icon: <Megaphone className="w-5 h-5" />, adminOnly: true },
  { to: '/users', label: 'จัดการผู้ใช้', icon: <Shield className="w-5 h-5" />, adminOnly: true },
  { to: '/settings', label: 'ตั้งค่าบริษัท', icon: <Settings className="w-5 h-5" />, adminOnly: true },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-64 shrink-0">
      <nav className="bg-white rounded-lg shadow p-4 sticky top-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          เมนูหลัก
        </h2>
        <ul className="space-y-2">
          {navItems
            .filter((item) => !item.adminOnly || user?.role === 'ADMIN')
            .map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`flex items-center px-4 py-2 rounded-lg transition-colors ${isActive(item.to)
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                >
                  <span className="mr-3">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </aside>
  );
};
