import { useAuth } from '../contexts/AuthContext';
import { PERMISSIONS, type Permission } from '@car-stock/shared/constants';

export function usePermission() {
  const { user } = useAuth();

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    const allowedRoles = PERMISSIONS[permission];
    return allowedRoles.includes(user.role as any);
  };

  const hasAnyPermission = (permissions: Permission[]): boolean => {
    return permissions.some((p) => hasPermission(p));
  };

  const hasAllPermissions = (permissions: Permission[]): boolean => {
    return permissions.every((p) => hasPermission(p));
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    user,
  };
}
