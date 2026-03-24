import { Elysia, t } from 'elysia';
import { systemService } from './system.service';
import { authMiddleware, requireRole } from '../auth/auth.middleware';

export const systemRoutes = new Elysia({ prefix: '/system' })
  // Get current version info
  .get(
    '/version',
    async () => {
      const version = await systemService.getVersion();
      return { success: true, data: version };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Check for available updates
  .get(
    '/check-update',
    async () => {
      const result = await systemService.checkForUpdate();
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Trigger update
  .post(
    '/update',
    async ({ set }) => {
      const result = await systemService.triggerUpdate();
      set.status = 202;
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Get update status (polled by frontend)
  .get(
    '/update-status',
    async () => {
      const status = await systemService.getUpdateStatus();
      return { success: true, data: status };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Trigger manual rollback
  .post(
    '/rollback',
    async ({ body, set }) => {
      const result = await systemService.triggerRollback(
        body?.commit,
        body?.backupFile
      );
      set.status = 202;
      return { success: true, data: result };
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
  // Trigger manual backup
  .post(
    '/backup',
    async () => {
      const result = await systemService.triggerBackup();
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // List available backups
  .get(
    '/backups',
    async () => {
      const result = await systemService.listBackups();
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // List update/rollback logs
  .get(
    '/logs',
    async () => {
      const result = await systemService.listLogs();
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  // Get specific log file contents
  .get(
    '/logs/:filename',
    async ({ params }) => {
      const result = await systemService.getLogFile(params.filename);
      return { success: true, data: result };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
      params: t.Object({
        filename: t.String(),
      }),
    }
  );
