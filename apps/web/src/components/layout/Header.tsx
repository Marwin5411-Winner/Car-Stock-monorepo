import { ROLE_LABELS } from '@car-stock/shared/constants';
import type React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import { Button } from '../ui/button';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  const { companyName } = useCompany();
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="px-4 lg:px-6 py-2.5 flex justify-between items-center">
        <h1 className="text-lg font-semibold text-gray-900">{companyName || '...'}</h1>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-gray-500">
              {ROLE_LABELS[user?.role as keyof typeof ROLE_LABELS]}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
};
