import { Elysia, t } from 'elysia';
import { usersService } from './users.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { authService } from '../auth/auth.service';

export const userRoutes = new Elysia({ prefix: '/users' })
  // Get all users
  .get(
    '/',
    async ({ query, set, requester }) => {
      try {
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');
        const search = query.search;

        // Check permission
        if (!authService.hasPermission(requester.role, 'USER_VIEW' as any)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Insufficient permissions',
          };
        }

        const result = await usersService.getAllUsers(page, limit, search);
        set.status = 200;
        return {
          success: true,
          data: result.data,
          meta: result.meta,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch users',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Users'],
        summary: 'Get all users',
        description: 'Get all users with pagination and search',
      },
    }
  )
  // Get user by ID
  .get(
    '/:id',
    async ({ params, set, requester }) => {
      try {
        const user = await usersService.getUserById(params.id, requester);
        set.status = 200;
        return {
          success: true,
          data: user,
        };
      } catch (error) {
        set.status = error instanceof Error && error.message === 'User not found' ? 404 : 400;
        return {
          success: false,
          error: 'Not found',
          message: error instanceof Error ? error.message : 'Failed to fetch user',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Users'],
        summary: 'Get user by ID',
        description: 'Get a specific user by ID',
      },
    }
  )
  // Create user
  .post(
    '/',
    async ({ body, set, requester }) => {
      try {
        const user = await usersService.createUser(body, requester);
        set.status = 201;
        return {
          success: true,
          data: user,
          message: 'User created successfully',
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Creation failed',
          message: error instanceof Error ? error.message : 'Failed to create user',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('USER_CREATE')],
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
        tags: ['Users'],
        summary: 'Create user',
        description: 'Create a new user (admin only)',
      },
    }
  )
  // Update user
  .patch(
    '/:id',
    async ({ params, body, set, requester }) => {
      try {
        const user = await usersService.updateUser(params.id, body, requester);
        set.status = 200;
        return {
          success: true,
          data: user,
          message: 'User updated successfully',
        };
      } catch (error) {
        set.status = error instanceof Error && error.message === 'User not found' ? 404 : 400;
        return {
          success: false,
          error: 'Update failed',
          message: error instanceof Error ? error.message : 'Failed to update user',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      body: t.Object({
        email: t.Optional(t.String({ format: 'email' })),
        firstName: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        lastName: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        phone: t.Optional(t.String()),
        role: t.Optional(
          t.Union([
            t.Literal('ADMIN'),
            t.Literal('SALES_MANAGER'),
            t.Literal('STOCK_STAFF'),
            t.Literal('ACCOUNTANT'),
            t.Literal('SALES_STAFF'),
          ])
        ),
        status: t.Optional(
          t.Union([t.Literal('ACTIVE'), t.Literal('INACTIVE')])
        ),
        profileImage: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Users'],
        summary: 'Update user',
        description: 'Update user information',
      },
    }
  )
  // Delete user
  .delete(
    '/:id',
    async ({ params, set, requester }) => {
      try {
        await usersService.deleteUser(params.id, requester);
        set.status = 200;
        return {
          success: true,
          message: 'User deleted successfully',
        };
      } catch (error) {
        set.status = error instanceof Error && error.message === 'User not found' ? 404 : 400;
        return {
          success: false,
          error: 'Deletion failed',
          message: error instanceof Error ? error.message : 'Failed to delete user',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requirePermission('USER_DELETE')],
      detail: {
        tags: ['Users'],
        summary: 'Delete user',
        description: 'Delete a user (admin only)',
      },
    }
  )
  // Update password
  .patch(
    '/:id/password',
    async ({ params, body, set, requester }) => {
      try {
        await usersService.updatePassword(
          params.id,
          body.currentPassword,
          body.newPassword,
          requester
        );
        set.status = 200;
        return {
          success: true,
          message: 'Password updated successfully',
        };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: 'Password update failed',
          message: error instanceof Error ? error.message : 'Failed to update password',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
      body: t.Object({
        currentPassword: t.String(),
        newPassword: t.String({ minLength: 6, maxLength: 100 }),
      }),
      detail: {
        tags: ['Users'],
        summary: 'Update password',
        description: 'Update user password',
      },
    }
  );
