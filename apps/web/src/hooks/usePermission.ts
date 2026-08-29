import { useAuth } from '../contexts/AuthContext';
import { PERMISSIONS, type Permission } from '@car-stock/shared/constants';

export function usePermission() {
  const { user } = useAuth();

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    const allowedRoles = PERMISSIONS[permission] as readonly string[] | undefined;
    return allowedRoles?.includes(user.role) ?? false;
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
