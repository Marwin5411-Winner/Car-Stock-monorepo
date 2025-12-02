import type { Context } from 'elysia';
import { authService } from './auth.service';
import { PERMISSIONS } from '@car-stock/shared/constants';

/**
 * Authentication middleware
 * Verifies JWT token and attaches user info to context
 */
export const authMiddleware = async (context: Context) => {
  const { request, jwt, set } = context;

  // Get token from Authorization header
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    set.status = 401;
    return {
      success: false,
      error: 'Unauthorized',
      message: 'No token provided',
    };
  }

  try {
    // Verify and decode token
    const decoded = await jwt.verify(token);

    if (!decoded) {
      set.status = 401;
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      };
    }

    // Attach user info to context
    context.requester = {
      id: decoded.sub as string,
      username: decoded.username as string,
      role: decoded.role as string,
    };

    return;
  } catch (error) {
    set.status = 401;
    return {
      success: false,
      error: 'Unauthorized',
      message: 'Invalid token',
    };
  }
};

/**
 * Permission-based middleware
 * Checks if user has required permission
 */
export const requirePermission = (permission: keyof typeof PERMISSIONS) => {
  return async (context: Context) => {
    const { requester, set } = context;

    if (!requester) {
      set.status = 401;
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      };
    }

    const hasPermission = authService.hasPermission(requester.role, permission);

    if (!hasPermission) {
      set.status = 403;
      return {
        success: false,
        error: 'Forbidden',
        message: 'Insufficient permissions',
      };
    }

    return;
  };
};

/**
 * Role-based middleware
 * Checks if user has one of the required roles
 */
export const requireRole = (...roles: string[]) => {
  return async (context: Context) => {
    const { requester, set } = context;

    if (!requester) {
      set.status = 401;
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      };
    }

    if (!roles.includes(requester.role)) {
      set.status = 403;
      return {
        success: false,
        error: 'Forbidden',
        message: 'Insufficient role',
      };
    }

    return;
  };
};

/**
 * Optional auth middleware
 * Attaches user info if token is present, but doesn't require it
 */
export const optionalAuth = async (context: Context) => {
  const { request, jwt } = context;

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return;
  }

  try {
    const decoded = await jwt.verify(token);

    if (decoded) {
      context.requester = {
        id: decoded.sub as string,
        username: decoded.username as string,
        role: decoded.role as string,
      };
    }
  } catch (error) {
    // Silently fail for optional auth
    return;
  }
};
