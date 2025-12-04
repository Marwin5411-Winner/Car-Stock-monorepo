import { Elysia, t } from 'elysia';
import { campaignsService } from './campaigns.service';
import { authMiddleware, requireRole } from '../auth/auth.middleware';

export const campaignRoutes = new Elysia({ prefix: '/campaigns' })
  // Get all campaigns (ADMIN only)
  .get(
    '/',
    async ({ query, set, requester }) => {
      try {
        if (requester.role !== 'ADMIN') {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Only admins can access campaigns',
          };
        }

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
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch campaigns',
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
        tags: ['Campaigns'],
        summary: 'Get all campaigns',
        description: 'Get campaigns with pagination and search (ADMIN only)',
      },
    }
  )
  // Get active campaigns (for sales - any authenticated user)
  .get(
    '/active',
    async ({ set, requester }) => {
      try {
        if (requester.role !== 'ADMIN') {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Only admins can access campaigns',
          };
        }

        const campaigns = await campaignsService.getActiveCampaigns();
        set.status = 200;
        return {
          success: true,
          data: campaigns,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch active campaigns',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
    async ({ params, set, requester }) => {
      try {
        if (requester.role !== 'ADMIN') {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Only admins can access campaigns',
          };
        }

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
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch campaign',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
    async ({ params, query, set, requester }) => {
      try {
        if (requester.role !== 'ADMIN') {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Only admins can access campaign analytics',
          };
        }

        const startDate = query.startDate ? new Date(query.startDate) : undefined;
        const endDate = query.endDate ? new Date(query.endDate) : undefined;

        const result = await campaignsService.getAnalytics(params.id, startDate, endDate);
        set.status = 200;
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch analytics',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
    async ({ params, set, requester }) => {
      try {
        if (requester.role !== 'ADMIN') {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Only admins can access campaigns',
          };
        }

        const vehicleModels = await campaignsService.getVehicleModels(params.id);
        set.status = 200;
        return {
          success: true,
          data: vehicleModels,
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to fetch vehicle models',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
      try {
        if (requester.role !== 'ADMIN') {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Only admins can create campaigns',
          };
        }

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
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to create campaign',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
    async ({ params, body, set, requester }) => {
      try {
        if (requester.role !== 'ADMIN') {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Only admins can update campaigns',
          };
        }

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
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to update campaign',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
    async ({ params, set, requester }) => {
      try {
        if (requester.role !== 'ADMIN') {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Only admins can delete campaigns',
          };
        }

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
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to delete campaign',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
    async ({ params, body, set, requester }) => {
      try {
        if (requester.role !== 'ADMIN') {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Only admins can modify campaigns',
          };
        }

        await campaignsService.addVehicleModel(params.id, body.vehicleModelId);
        set.status = 201;
        return {
          success: true,
          message: 'Vehicle model added to campaign',
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to add vehicle model',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
    async ({ params, set, requester }) => {
      try {
        if (requester.role !== 'ADMIN') {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden',
            message: 'Only admins can modify campaigns',
          };
        }

        await campaignsService.removeVehicleModel(params.id, params.modelId);
        set.status = 200;
        return {
          success: true,
          message: 'Vehicle model removed from campaign',
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: 'Server error',
          message: error instanceof Error ? error.message : 'Failed to remove vehicle model',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
  );
