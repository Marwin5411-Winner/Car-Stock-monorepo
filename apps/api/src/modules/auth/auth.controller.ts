import { Elysia, t } from 'elysia';
import { authService } from './auth.service';
import { authMiddleware } from './auth.middleware';

export const authRoutes = new Elysia({ prefix: '/auth' })
  // Login endpoint
  .post(
    '/login',
    async ({ body, jwt, set }) => {
      try {
        const result = await authService.login(body, jwt);
        set.status = 200;
        return {
          success: true,
          data: result,
          message: 'Login successful',
        };
      } catch (error) {
        set.status = 401;
        return {
          success: false,
          error: 'Authentication failed',
          message: error instanceof Error ? error.message : 'Login failed',
        };
      }
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3 }),
        password: t.String({ minLength: 6 }),
      }),
      detail: {
        tags: ['Auth'],
        summary: 'User login',
        description: 'Authenticate user and get JWT token',
      },
    }
  )
  // Register endpoint (admin only)
  .post(
    '/register',
    async ({ body, set, requester }) => {
      try {
        const result = await authService.register(body, requester);
        set.status = 201;
        return {
          success: true,
          data: result,
          message: 'User registered successfully',
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Registration failed',
          message: error instanceof Error ? error.message : 'Registration failed',
        };
      }
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3, maxLength: 50 }),
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 6, maxLength: 100 }),
        firstName: t.String({ minLength: 1, maxLength: 100 }),
        lastName: t.String({ minLength: 1, maxLength: 100 }),
        phone: t.Optional(t.String()),
        role: t.Union([
          t.Literal('ADMIN'),
          t.Literal('SALES_MANAGER'),
          t.Literal('STOCK_STAFF'),
          t.Literal('ACCOUNTANT'),
          t.Literal('SALES_STAFF'),
        ]),
      }),
      detail: {
        tags: ['Auth'],
        summary: 'Register new user',
        description: 'Create a new user account (admin only)',
      },
    }
  )
  // Get current user profile
  .get(
    '/profile',
    async ({ set, requester }) => {
      try {
        const profile = await authService.getProfile(requester.id);
        set.status = 200;
        return {
          success: true,
          data: profile,
        };
      } catch (error) {
        set.status = 404;
        return {
          success: false,
          error: 'Not found',
          message: error instanceof Error ? error.message : 'Profile not found',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Auth'],
        summary: 'Get current user profile',
        description: 'Get the profile of the authenticated user',
      },
    }
  )
  // Logout endpoint
  .post(
    '/logout',
    async ({ set, requester }) => {
      try {
        await authService.logout(requester.id);
        set.status = 200;
        return {
          success: true,
          message: 'Logout successful',
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Logout failed',
          message: error instanceof Error ? error.message : 'Logout failed',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Auth'],
        summary: 'User logout',
        description: 'Logout and log the activity',
      },
    }
  )
  // Check permission
  .get(
    '/check-permission/:permission',
    async ({ params, set, requester }) => {
      try {
        const hasPermission = authService.hasPermission(
          requester.role,
          params.permission
        );
        set.status = 200;
        return {
          success: true,
          data: {
            permission: params.permission,
            hasPermission,
          },
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Permission check failed',
          message: error instanceof Error ? error.message : 'Failed to check permission',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Auth'],
        summary: 'Check user permission',
        description: 'Check if the authenticated user has a specific permission',
      },
    }
  );
