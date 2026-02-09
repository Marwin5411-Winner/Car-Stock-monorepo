import { db } from '../../lib/db';
import { CreateVehicleModelSchema, UpdateVehicleModelSchema } from '@car-stock/shared/schemas';
import { authService } from '../auth/auth.service';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../lib/errors';

export class VehiclesService {
  /**
   * Get all vehicle models with pagination
   */
  async getAllVehicles(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { brand: { contains: search, mode: 'insensitive' } },
            { model: { contains: search, mode: 'insensitive' } },
            { variant: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [vehicles, total] = await Promise.all([
      db.vehicleModel.findMany({
        where,
        select: {
          id: true,
          brand: true,
          model: true,
          variant: true,
          year: true,
          type: true,
          price: true,
          standardCost: true,
          targetMargin: true,
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: limit,
        orderBy: { brand: 'asc' },
      }),
      db.vehicleModel.count({ where }),
    ]);

    return {
      data: vehicles,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get vehicle model by ID
   */
  async getVehicleById(id: string) {
    const vehicle = await db.vehicleModel.findUnique({
      where: { id },
      include: {
        stocks: {
          select: {
            id: true,
            vin: true,
            status: true,
            exteriorColor: true,
            arrivalDate: true,
          },
          orderBy: { arrivalDate: 'desc' },
        },
        _count: {
          select: {
            stocks: true,
            sales: true,
          },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundError('Vehicle model');
    }

    return vehicle;
  }

  /**
   * Create new vehicle model
   */
  async createVehicle(data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_VIEW' as any)) {
      throw new ForbiddenError();
    }

    const validated = CreateVehicleModelSchema.parse(data);

    // Check for duplicate (brand + model + variant + year)
    const existing = await db.vehicleModel.findFirst({
      where: {
        brand: validated.brand,
        model: validated.model,
        variant: validated.variant,
        year: validated.year,
      },
    });

    if (existing) {
      throw new ConflictError('Vehicle model');
    }

    // Create vehicle model
    const vehicle = await db.vehicleModel.create({
      data: validated,
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE_VEHICLE_MODEL',
        entity: 'VEHICLE_MODEL',
        entityId: vehicle.id,
        details: {
          brand: vehicle.brand,
          model: vehicle.model,
          variant: vehicle.variant,
          year: vehicle.year,
        },
      },
    });

    return vehicle;
  }

  /**
   * Update vehicle model
   */
  async updateVehicle(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_UPDATE' as any)) {
      throw new ForbiddenError();
    }

    const validated = UpdateVehicleModelSchema.parse(data);

    // Check if vehicle exists
    const existingVehicle = await db.vehicleModel.findUnique({
      where: { id },
      select: { id: true, brand: true, model: true, variant: true, year: true },
    });

    if (!existingVehicle) {
      throw new NotFoundError('Vehicle model');
    }

    // Check for duplicate (if updating key fields)
    if (validated.brand || validated.model || validated.variant || validated.year) {
      const checkBrand = validated.brand || existingVehicle.brand;
      const checkModel = validated.model || existingVehicle.model;
      const checkVariant = validated.variant || existingVehicle.variant;
      const checkYear = validated.year || existingVehicle.year;

      const duplicate = await db.vehicleModel.findFirst({
        where: {
          brand: checkBrand,
          model: checkModel,
          variant: checkVariant,
          year: checkYear,
          NOT: { id },
        },
      });

      if (duplicate) {
        throw new ConflictError('Vehicle model');
      }
    }

    // Update vehicle model
    const vehicle = await db.vehicleModel.update({
      where: { id },
      data: validated,
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_VEHICLE_MODEL',
        entity: 'VEHICLE_MODEL',
        entityId: vehicle.id,
        details: {
          brand: vehicle.brand,
          model: vehicle.model,
          changes: validated,
        },
      },
    });

    return vehicle;
  }

  /**
   * Delete vehicle model
   */
  async deleteVehicle(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_DELETE' as any)) {
      throw new ForbiddenError();
    }

    // Check if vehicle has associated stock or sales
    const [stockCount, salesCount] = await Promise.all([
      db.stock.count({ where: { vehicleModelId: id } }),
      db.sale.count({ where: { vehicleModelId: id } }),
    ]);

    if (stockCount > 0 || salesCount > 0) {
      throw new BadRequestError('Cannot delete vehicle model with existing stock or sales');
    }

    // Get vehicle for logging
    const vehicle = await db.vehicleModel.findUnique({
      where: { id },
      select: { brand: true, model: true, variant: true, year: true },
    });

    if (!vehicle) {
      throw new NotFoundError('Vehicle model');
    }

    // Delete vehicle model
    await db.vehicleModel.delete({
      where: { id },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'DELETE_VEHICLE_MODEL',
        entity: 'VEHICLE_MODEL',
        entityId: id,
        details: {
          brand: vehicle.brand,
          model: vehicle.model,
          variant: vehicle.variant,
          year: vehicle.year,
        },
      },
    });

    return { success: true, message: 'Vehicle model deleted successfully' };
  }

  /**
   * Get vehicle models with available stock
   */
  async getAvailableModels() {
    const vehicles = await db.vehicleModel.findMany({
      select: {
        id: true,
        brand: true,
        model: true,
        variant: true,
        year: true,
        type: true,
        primaryColor: true,
        secondaryColor: true,
        mainOptions: true,
        price: true,
        _count: {
          select: {
            stocks: {
              where: { status: 'AVAILABLE' },
            },
          },
        },
      },
      orderBy: [{ brand: 'asc' }, { model: 'asc' }],
    });

    return vehicles;
  }
}

export const vehiclesService = new VehiclesService();
