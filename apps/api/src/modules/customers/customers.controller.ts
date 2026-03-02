import { Elysia, t } from 'elysia';
import { customersService } from './customers.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';

export const customerRoutes = new Elysia({ prefix: '/customers' })
  // Get all customers
  .get(
    '/',
    async ({ query, set, requester }) => {
      const result = await customersService.getAllCustomers(query, requester);
      set.status = 200;
      return {
        success: true,
        data: result.data,
        meta: result.meta,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
        type: t.Optional(t.Union([t.Literal('INDIVIDUAL'), t.Literal('COMPANY')])),
        salesType: t.Optional(t.Union([t.Literal('NORMAL_SALES'), t.Literal('FLEET_SALES')])),
      }),
      detail: {
        tags: ['Customers'],
        summary: 'Get all customers',
        description: 'Get customers with pagination and filters',
      },
    }
  )
  // Get customer by ID
  .get(
    '/:id',
    async ({ params, set, requester }) => {
      const customer = await customersService.getCustomerById(params.id, requester);
      set.status = 200;
      return {
        success: true,
        data: customer,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Customers'],
        summary: 'Get customer by ID',
        description: 'Get a specific customer with sales and payments history',
      },
    }
  )
  // Create customer
  .post(
    '/',
    async ({ body, set, requester }) => {
      const customer = await customersService.createCustomer(body, requester);
      set.status = 201;
      return {
        success: true,
        data: customer,
        message: 'Customer created successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CUSTOMER_CREATE')],
      body: t.Object({
        type: t.Union([t.Literal('INDIVIDUAL'), t.Literal('COMPANY')]),
        salesType: t.Union([t.Literal('NORMAL_SALES'), t.Literal('FLEET_SALES')]),
        name: t.String({ minLength: 1 }),
        taxId: t.Optional(t.String()),
        houseNumber: t.String({ minLength: 1 }),
        street: t.Optional(t.String()),
        subdistrict: t.String({ minLength: 1 }),
        district: t.String({ minLength: 1 }),
        province: t.String({ minLength: 1 }),
        postalCode: t.Optional(t.String()),
        phone: t.String({ minLength: 1 }),
        email: t.Optional(t.String()),
        website: t.Optional(t.String()),
        contactName: t.Optional(t.String()),
        contactRole: t.Optional(t.String()),
        contactMobile: t.Optional(t.String()),
        contactEmail: t.Optional(t.String()),
        creditTermDays: t.Optional(t.Number()),
        creditLimit: t.Optional(t.Number()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Customers'],
        summary: 'Create customer',
        description: 'Create a new customer with Thai address structure',
      },
    }
  )
  // Update customer
  .patch(
    '/:id',
    async ({ params, body, set, requester }) => {
      const customer = await customersService.updateCustomer(params.id, body, requester);
      set.status = 200;
      return {
        success: true,
        data: customer,
        message: 'Customer updated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CUSTOMER_UPDATE')],
      body: t.Object({
        type: t.Optional(t.Union([t.Literal('INDIVIDUAL'), t.Literal('COMPANY')])),
        salesType: t.Optional(t.Union([t.Literal('NORMAL_SALES'), t.Literal('FLEET_SALES')])),
        name: t.Optional(t.String({ minLength: 1 })),
        taxId: t.Optional(t.String()),
        houseNumber: t.Optional(t.String({ minLength: 1 })),
        street: t.Optional(t.String()),
        subdistrict: t.Optional(t.String({ minLength: 1 })),
        district: t.Optional(t.String({ minLength: 1 })),
        province: t.Optional(t.String({ minLength: 1 })),
        postalCode: t.Optional(t.String()),
        phone: t.Optional(t.String({ minLength: 1 })),
        email: t.Optional(t.String()),
        website: t.Optional(t.String()),
        contactName: t.Optional(t.String()),
        contactRole: t.Optional(t.String()),
        contactMobile: t.Optional(t.String()),
        contactEmail: t.Optional(t.String()),
        creditTermDays: t.Optional(t.Number()),
        creditLimit: t.Optional(t.Number()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Customers'],
        summary: 'Update customer',
        description: 'Update customer information',
      },
    }
  )
  // Delete customer
  .delete(
    '/:id',
    async ({ params, set, requester }) => {
      await customersService.deleteCustomer(params.id, requester);
      set.status = 200;
      return {
        success: true,
        message: 'Customer deleted successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CUSTOMER_DELETE')],
      detail: {
        tags: ['Customers'],
        summary: 'Delete customer',
        description: 'Delete a customer (admin only, cannot delete if has sales)',
      },
    }
  );
