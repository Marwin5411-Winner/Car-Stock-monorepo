import { Elysia, t } from 'elysia';
import { settingsService } from './settings.service';
import { CompanySettingsSchema } from './types';
import { authMiddleware, requireRole } from '../auth/auth.middleware';

export const settingsRoutes = new Elysia({ prefix: '/settings' })
  .get(
    '/',
    async () => {
      const settings = await settingsService.getSettings();
      return {
        success: true,
        data: settings,
      };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
    }
  )
  .put(
    '/',
    async ({ body }) => {
      const result = await settingsService.updateSettings(body);
      return {
        success: true,
        data: result,
        message: 'Settings updated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
      body: CompanySettingsSchema,
    }
  );
