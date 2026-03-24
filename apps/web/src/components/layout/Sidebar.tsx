import { cn } from '@/lib/utils';
import type { Permission } from '@car-stock/shared/constants';
import {
  BarChart3,
  Car,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Megaphone,
  Package,
  Percent,
  PieChart,
  Settings,
  Shield,
  ShoppingCart,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePermission } from '../../hooks/usePermission';
import { useCompany } from '../../contexts/CompanyContext';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  permission?: Permission;
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <BarChart3 className="w-5 h-5" /> },
  {
    to: '/customers',
    label: 'ลูกค้า',
    icon: <Users className="w-5 h-5" />,
    permission: 'CUSTOMER_VIEW',
  },
  {
    to: '/vehicles',
    label: 'รุ่นรถยนต์',
    icon: <Car className="w-5 h-5" />,
    permission: 'VEHICLE_VIEW',
  },
  { to: '/stock', label: 'Stock', icon: <Package className="w-5 h-5" />, permission: 'STOCK_VIEW' },
  {
    to: '/interest',
    label: 'ดอกเบี้ย Stock',
    icon: <Percent className="w-5 h-5" />,
    permission: 'INTEREST_VIEW',
  },
  {
    to: '/quotations',
    label: 'ใบเสนอราคา',
    icon: <FileText className="w-5 h-5" />,
    permission: 'QUOTATION_CREATE',
  },
  {
    to: '/sales',
    label: 'การขาย',
    icon: <ShoppingCart className="w-5 h-5" />,
    permission: 'SALE_VIEW',
  },
  {
    to: '/payments',
    label: 'การชำระเงิน',
    icon: <CreditCard className="w-5 h-5" />,
    permission: 'PAYMENT_VIEW',
  },
  {
    to: '/reports',
    label: 'รายงาน',
    icon: <PieChart className="w-5 h-5" />,
    permission: 'REPORTS_INDEX',
  },
  {
    to: '/campaigns',
    label: 'แคมเปญ',
    icon: <Megaphone className="w-5 h-5" />,
    permission: 'CAMPAIGN_VIEW',
  },
  {
    to: '/users',
    label: 'จัดการผู้ใช้',
    icon: <Shield className="w-5 h-5" />,
    permission: 'USER_VIEW',
  },
  {
    to: '/settings',
    label: 'ตั้งค่าบริษัท',
    icon: <Settings className="w-5 h-5" />,
    permission: 'SETTINGS_VIEW',
  },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { hasPermission } = usePermission();
  const { companyName } = useCompany();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar-collapsed', String(!prev));
      return !prev;
    });
  };

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className={cn(
        'shrink-0 bg-slate-900 text-white flex flex-col h-screen transition-all duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Brand */}
      <div className="flex items-center h-14 px-3 border-b border-slate-700/50 shrink-0">
        {!collapsed ? (
          <h1 className="text-sm font-semibold text-white truncate">{companyName || '...'}</h1>
        ) : (
          <span className="mx-auto text-lg font-bold text-white">V</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2">
        {!collapsed && (
          <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2 mt-1">
            เมนูหลัก
          </h2>
        )}
        <ul className="space-y-1">
          {navItems
            .filter((item) => !item.permission || hasPermission(item.permission))
            .map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'flex items-center rounded-md text-sm transition-colors',
                    collapsed ? 'px-2 py-2 justify-center' : 'px-3 py-2 gap-3',
                    isActive(item.to)
                      ? 'bg-slate-700 text-white border-l-2 border-blue-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  )}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && item.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-slate-700/50 shrink-0">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center justify-center w-full rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
};
