import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { jwt } from '@elysiajs/jwt';
import { db } from './lib/db';

// Import routes
import { authRoutes } from './modules/auth/auth.controller';
import { userRoutes } from './modules/users/users.controller';
import { customerRoutes } from './modules/customers/customers.controller';
import { vehicleRoutes } from './modules/vehicles/vehicles.controller';
import { stockRoutes } from './modules/stock/stock.controller';
import { salesRoutes } from './modules/sales/sales.controller';
import { paymentRoutes } from './modules/payments/payments.controller';
import { quotationRoutes } from './modules/quotations/quotations.controller';
import { interestRoutes } from './modules/interest/interest.controller';
import { campaignRoutes } from './modules/campaigns/campaigns.controller';
import { reportRoutes } from './modules/reports/reports.controller';
import { pdfRoutes } from './modules/pdf/pdf.controller';
// import { documentRoutes } from './modules/documents/documents.controller';
// import { analyticsRoutes } from './modules/analytics/analytics.controller';

const app = new Elysia()
  // CORS configuration
  .use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    })
  )
  // Swagger documentation
  .use(
    swagger({
      documentation: {
        info: {
          title: 'VBeyond Car Sales API',
          version: '1.0.0',
          description: 'API for Car Sales Management System',
        },
        tags: [
          { name: 'Auth', description: 'Authentication endpoints' },
          { name: 'Users', description: 'User management' },
          { name: 'Customers', description: 'Customer management' },
          { name: 'Vehicles', description: 'Vehicle model management' },
          { name: 'Stock', description: 'Stock/inventory management' },
          { name: 'Interest', description: 'Stock interest management' },
          { name: 'Sales', description: 'Sales pipeline management' },
          { name: 'Payments', description: 'Payment management' },
          { name: 'Campaigns', description: 'Campaign management' },
          { name: 'Reports', description: 'Reports and analytics' },
          { name: 'Documents', description: 'Document generation' },
        ],
      },
      path: '/docs',
    })
  )
  // JWT configuration
  .use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      exp: '24h',
    })
  )
  // Health check endpoint
  .get('/', () => ({
    name: 'VBeyond Car Sales API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  }))
  // Health check with database
  .get('/health', async () => {
    try {
      await db.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  })
  // API routes group
  .group('/api', (app) =>
    app
      .get('/', () => ({ message: 'Welcome to VBeyond Car Sales API' }))
      // Routes
      .use(authRoutes)
      .use(userRoutes)
      .use(customerRoutes)
      .use(vehicleRoutes)
      .use(stockRoutes)
      .use(salesRoutes)
      .use(paymentRoutes)
      .use(quotationRoutes)
      .use(interestRoutes)
      .use(campaignRoutes)
      .use(reportRoutes)
      .use(pdfRoutes)
      // .use(documentRoutes)
      // .use(analyticsRoutes)
  )
  // Error handling
  .onError(({ code, error, set }) => {
    console.error(`Error [${code}]:`, error);

    if (code === 'VALIDATION') {
      set.status = 400;
      return {
        success: false,
        error: 'Validation Error',
        message: error.message,
      };
    }

    if (code === 'NOT_FOUND') {
      set.status = 404;
      return {
        success: false,
        error: 'Not Found',
        message: 'The requested resource was not found',
      };
    }

    set.status = 500;
    return {
      success: false,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
    };
  })
  .listen(process.env.PORT || 3001);

console.log(`
🚗 VBeyond Car Sales API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Server:  http://${app.server?.hostname}:${app.server?.port}
📚 Docs:    http://${app.server?.hostname}:${app.server?.port}/docs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

export type App = typeof app;
