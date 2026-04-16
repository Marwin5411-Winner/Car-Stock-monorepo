import { Elysia, t } from 'elysia';
import { campaignsService } from './campaigns.service';
import { campaignFormulasService } from './campaign-formulas.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';

export const campaignRoutes = new Elysia({ prefix: '/campaigns' })
  // Get all campaigns (ADMIN only)
  .get(
    '/',
    async ({ query, set }) => {
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const search = query.search;

      const result = await campaignsService.getAll(page, limit, search);
      set.status = 200;
      return {
        success: true,
        data: result.data,
        meta: result.meta,
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Get all campaigns',
        description: 'Get campaigns with pagination and search (ADMIN only)',
      },
    }
  )
  // Get active campaigns (for sales - any authenticated user)
  .get(
    '/active',
    async ({ set }) => {
      const campaigns = await campaignsService.getActiveCampaigns();
      set.status = 200;
      return {
        success: true,
        data: campaigns,
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      detail: {
        tags: ['Campaigns'],
        summary: 'Get active campaigns',
        description: 'Get currently active campaigns (ADMIN only)',
      },
    }
  )
  // Get campaign by ID (ADMIN only)
  .get(
    '/:id',
    async ({ params, set }) => {
      const campaign = await campaignsService.getById(params.id);
      if (!campaign) {
        set.status = 404;
        return {
          success: false,
          error: 'Not Found',
          message: 'Campaign not found',
        };
      }

      set.status = 200;
      return {
        success: true,
        data: campaign,
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Get campaign by ID',
        description: 'Get a single campaign by ID (ADMIN only)',
      },
    }
  )
  // Get campaign analytics (ADMIN only)
  .get(
    '/:id/analytics',
    async ({ params, query, set }) => {
      const startDate = query.startDate ? new Date(query.startDate) : undefined;
      const endDate = query.endDate ? new Date(query.endDate) : undefined;

      const result = await campaignsService.getAnalytics(params.id, startDate, endDate);
      set.status = 200;
      return {
        success: true,
        data: result,
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      params: t.Object({
        id: t.String(),
      }),
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Get campaign analytics',
        description: 'Get sales analytics for a campaign by vehicle model (ADMIN only)',
      },
    }
  )
  // Get vehicle models under campaign (ADMIN only)
  .get(
    '/:id/vehicle-models',
    async ({ params, set }) => {
      const vehicleModels = await campaignsService.getVehicleModels(params.id);
      set.status = 200;
      return {
        success: true,
        data: vehicleModels,
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Get vehicle models in campaign',
        description: 'Get all vehicle models associated with a campaign (ADMIN only)',
      },
    }
  )
  // Create campaign (ADMIN only)
  .post(
    '/',
    async ({ body, set, requester }) => {
      // Authorization is enforced by `requirePermission('CAMPAIGN_CREATE')` in
      // `beforeHandle`. A redundant role-literal check here would block any
      // non-ADMIN role that is legitimately granted CAMPAIGN_CREATE permission.

      const campaign = await campaignsService.create({
        ...body,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        createdById: requester.id,
      });

      set.status = 201;
      return {
        success: true,
        data: campaign,
        message: 'Campaign created successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_CREATE')],
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        startDate: t.String(),
        endDate: t.String(),
        notes: t.Optional(t.String()),
        vehicleModelIds: t.Optional(t.Array(t.String())),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Create campaign',
        description: 'Create a new campaign (ADMIN only)',
      },
    }
  )
  // Update campaign (ADMIN only)
  .put(
    '/:id',
    async ({ params, body, set }) => {
      const existing = await campaignsService.getById(params.id);
      if (!existing) {
        set.status = 404;
        return {
          success: false,
          error: 'Not Found',
          message: 'Campaign not found',
        };
      }

      const campaign = await campaignsService.update(params.id, {
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
      });

      set.status = 200;
      return {
        success: true,
        data: campaign,
        message: 'Campaign updated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.String()),
        status: t.Optional(t.Union([t.Literal('DRAFT'), t.Literal('ACTIVE'), t.Literal('ENDED')])),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        vehicleModelIds: t.Optional(t.Array(t.String())),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Update campaign',
        description: 'Update an existing campaign (ADMIN only)',
      },
    }
  )
  // Delete campaign (ADMIN only)
  .delete(
    '/:id',
    async ({ params, set }) => {
      const existing = await campaignsService.getById(params.id);
      if (!existing) {
        set.status = 404;
        return {
          success: false,
          error: 'Not Found',
          message: 'Campaign not found',
        };
      }

      await campaignsService.delete(params.id);
      set.status = 200;
      return {
        success: true,
        message: 'Campaign deleted successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_DELETE')],
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Delete campaign',
        description: 'Delete a campaign (ADMIN only)',
      },
    }
  )
  // Add vehicle model to campaign (ADMIN only)
  .post(
    '/:id/vehicle-models',
    async ({ params, body, set }) => {
      await campaignsService.addVehicleModel(params.id, body.vehicleModelId);
      set.status = 201;
      return {
        success: true,
        message: 'Vehicle model added to campaign',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        vehicleModelId: t.String(),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Add vehicle model to campaign',
        description: 'Add a vehicle model to a campaign (ADMIN only)',
      },
    }
  )
  // Remove vehicle model from campaign (ADMIN only)
  .delete(
    '/:id/vehicle-models/:modelId',
    async ({ params, set }) => {
      await campaignsService.removeVehicleModel(params.id, params.modelId);
      set.status = 200;
      return {
        success: true,
        message: 'Vehicle model removed from campaign',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({
        id: t.String(),
        modelId: t.String(),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Remove vehicle model from campaign',
        description: 'Remove a vehicle model from a campaign (ADMIN only)',
      },
    }
  )
  // ============================================
  // Campaign Formula Routes
  // ============================================
  // Get formulas for a vehicle model in campaign
  .get(
    '/:id/vehicle-models/:modelId/formulas',
    async ({ params, set }) => {
      const formulas = await campaignFormulasService.getFormulas(params.id, params.modelId);
      set.status = 200;
      return { success: true, data: formulas };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      params: t.Object({ id: t.String(), modelId: t.String() }),
      detail: {
        tags: ['Campaign Formulas'],
        summary: 'Get formulas for vehicle model in campaign',
      },
    }
  )
  // Create formula
  .post(
    '/:id/vehicle-models/:modelId/formulas',
    async ({ params, body, set }) => {
      const formula = await campaignFormulasService.create({
        campaignId: params.id,
        vehicleModelId: params.modelId,
        name: body.name,
        operator: body.operator as any,
        value: body.value,
        priceTarget: body.priceTarget as any,
        sortOrder: body.sortOrder,
      });
      set.status = 201;
      return { success: true, data: formula, message: 'Formula created successfully' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({ id: t.String(), modelId: t.String() }),
      body: t.Object({
        name: t.String({ minLength: 1 }),
        operator: t.Union([
          t.Literal('ADD'),
          t.Literal('SUBTRACT'),
          t.Literal('MULTIPLY'),
          t.Literal('PERCENT'),
        ]),
        value: t.Number(),
        priceTarget: t.Union([t.Literal('COST_PRICE'), t.Literal('SELLING_PRICE')]),
        sortOrder: t.Optional(t.Number()),
      }),
      detail: {
        tags: ['Campaign Formulas'],
        summary: 'Create formula for vehicle model in campaign',
      },
    }
  )
  // Update formula
  .put(
    '/:id/vehicle-models/:modelId/formulas/:formulaId',
    async ({ params, body, set }) => {
      const formula = await campaignFormulasService.update(params.formulaId, {
        name: body.name,
        operator: body.operator as any,
        value: body.value,
        priceTarget: body.priceTarget as any,
        sortOrder: body.sortOrder,
      });
      set.status = 200;
      return { success: true, data: formula, message: 'Formula updated successfully' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({ id: t.String(), modelId: t.String(), formulaId: t.String() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        operator: t.Optional(
          t.Union([
            t.Literal('ADD'),
            t.Literal('SUBTRACT'),
            t.Literal('MULTIPLY'),
            t.Literal('PERCENT'),
          ])
        ),
        value: t.Optional(t.Number()),
        priceTarget: t.Optional(
          t.Union([t.Literal('COST_PRICE'), t.Literal('SELLING_PRICE')])
        ),
        sortOrder: t.Optional(t.Number()),
      }),
      detail: {
        tags: ['Campaign Formulas'],
        summary: 'Update formula',
      },
    }
  )
  // Delete formula
  .delete(
    '/:id/vehicle-models/:modelId/formulas/:formulaId',
    async ({ params, set }) => {
      await campaignFormulasService.delete(params.formulaId);
      set.status = 200;
      return { success: true, message: 'Formula deleted successfully' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({ id: t.String(), modelId: t.String(), formulaId: t.String() }),
      detail: {
        tags: ['Campaign Formulas'],
        summary: 'Delete formula',
      },
    }
  )
  // Reorder formulas
  .put(
    '/:id/vehicle-models/:modelId/formulas-reorder',
    async ({ params, body, set }) => {
      const formulas = await campaignFormulasService.reorder(
        params.id,
        params.modelId,
        body.items
      );
      set.status = 200;
      return { success: true, data: formulas, message: 'Formulas reordered successfully' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({ id: t.String(), modelId: t.String() }),
      body: t.Object({
        items: t.Array(
          t.Object({
            formulaId: t.String(),
            sortOrder: t.Number(),
          })
        ),
      }),
      detail: {
        tags: ['Campaign Formulas'],
        summary: 'Reorder formulas for vehicle model in campaign',
      },
    }
  )
  // ============================================
  // Campaign Report Route
  // ============================================
  .get(
    '/:id/report',
    async ({ params, set }) => {
      const report = await campaignsService.getCampaignReport(params.id);
      set.status = 200;
      return { success: true, data: report };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Get campaign report data',
        description: 'Get report data for campaign with sold stocks grouped by model and formula calculations',
      },
    }
  );
