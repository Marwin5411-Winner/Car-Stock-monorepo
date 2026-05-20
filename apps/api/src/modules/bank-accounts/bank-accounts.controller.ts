import { Elysia, t } from 'elysia';
import { authMiddleware, requireRole } from '../auth/auth.middleware';
import { bankAccountsService } from './bank-accounts.service';
import { BankAccountSchema } from './types';

export const bankAccountsRoutes = new Elysia({ prefix: '/bank-accounts' })
  .get(
    '/',
    async ({ query }) => {
      const includeInactive = query?.includeInactive === 'true';
      const data = await bankAccountsService.list(includeInactive);
      return { success: true, data };
    },
    {
      beforeHandle: [authMiddleware],
      query: t.Optional(
        t.Object({
          includeInactive: t.Optional(t.String()),
        })
      ),
    }
  )
  .post(
    '/',
    async ({ body }) => {
      const data = await bankAccountsService.create(body);
      return { success: true, data, message: 'Bank account created' };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
      body: BankAccountSchema,
    }
  )
  .put(
    '/:id',
    async ({ params, body }) => {
      const data = await bankAccountsService.update(params.id, body);
      return { success: true, data, message: 'Bank account updated' };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
      params: t.Object({ id: t.String() }),
      body: BankAccountSchema,
    }
  )
  .delete(
    '/:id',
    async ({ params }) => {
      await bankAccountsService.remove(params.id);
      return { success: true, message: 'Bank account deleted' };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
      params: t.Object({ id: t.String() }),
    }
  );
