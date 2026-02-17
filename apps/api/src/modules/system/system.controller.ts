import { Elysia, t } from 'elysia';
import { systemService } from './system.service';
import { authMiddleware, requireRole } from '../auth/auth.middleware';

export const systemRoutes = new Elysia({ prefix: '/system' })
  // Get current version info
  .get(
    '/version',
    async ({ set }) => {
      try {
        const version = await systemService.getVersion();
        return { success: true, data: version };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          message: 'Failed to get version info',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Check for available updates
  .get(
    '/check-update',
    async ({ set }) => {
      try {
        const result = await systemService.checkForUpdate();
        return { success: true, data: result };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          message: 'Failed to check for updates',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Trigger update
  .post(
    '/update',
    async ({ set }) => {
      try {
        const result = await systemService.triggerUpdate();
        set.status = 202;
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        // Check if it's a conflict (update already running)
        if (message.includes('already in progress')) {
          set.status = 409;
        } else {
          set.status = 500;
        }
        return {
          success: false,
          message: 'Failed to trigger update',
          error: message,
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Get update status (polled by frontend)
  .get(
    '/update-status',
    async ({ set }) => {
      try {
        const status = await systemService.getUpdateStatus();
        return { success: true, data: status };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          message: 'Failed to get update status',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Trigger manual rollback
  .post(
    '/rollback',
    async ({ body, set }) => {
      try {
        const result = await systemService.triggerRollback(
          body?.commit,
          body?.backupFile
        );
        set.status = 202;
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('update is in progress')) {
          set.status = 409;
        } else {
          set.status = 500;
        }
        return {
          success: false,
          message: 'Failed to trigger rollback',
          error: message,
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
      body: t.Optional(
        t.Object({
          commit: t.Optional(t.String()),
          backupFile: t.Optional(t.String()),
        })
      ),
    }
  )
  // List available backups
  .get(
    '/backups',
    async ({ set }) => {
      try {
        const result = await systemService.listBackups();
        return { success: true, data: result };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          message: 'Failed to list backups',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  );
