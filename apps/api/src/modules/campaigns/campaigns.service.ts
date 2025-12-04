import { db } from '../../lib/db';
import { Prisma } from '@prisma/client';

interface CreateCampaignData {
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  notes?: string;
  vehicleModelIds?: string[];
  createdById: string;
}

interface UpdateCampaignData {
  name?: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ENDED';
  startDate?: Date;
  endDate?: Date;
  notes?: string;
  vehicleModelIds?: string[];
}

interface CampaignAnalytics {
  vehicleModelId: string;
  vehicleModel: {
    id: string;
    brand: string;
    model: string;
    variant?: string;
    year: number;
  };
  totalSales: number;
  totalAmount: number;
  directSales: number;
  reservationSales: number;
}

class CampaignsService {
  /**
   * Get all campaigns with pagination
   */
  async getAll(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.CampaignWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [campaigns, total] = await Promise.all([
      db.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          vehicleModels: {
            include: {
              vehicleModel: {
                select: {
                  id: true,
                  brand: true,
                  model: true,
                  variant: true,
                  year: true,
                },
              },
            },
          },
          _count: {
            select: { sales: true },
          },
        },
      }),
      db.campaign.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: campaigns.map((campaign) => ({
        ...campaign,
        vehicleModels: campaign.vehicleModels.map((vm) => vm.vehicleModel),
        salesCount: campaign._count.sales,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get campaign by ID
   */
  async getById(id: string) {
    const campaign = await db.campaign.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        vehicleModels: {
          include: {
            vehicleModel: {
              select: {
                id: true,
                brand: true,
                model: true,
                variant: true,
                year: true,
                price: true,
              },
            },
          },
        },
        _count: {
          select: { sales: true },
        },
      },
    });

    if (!campaign) return null;

    return {
      ...campaign,
      vehicleModels: campaign.vehicleModels.map((vm) => vm.vehicleModel),
      salesCount: campaign._count.sales,
    };
  }

  /**
   * Create a new campaign
   */
  async create(data: CreateCampaignData) {
    const { vehicleModelIds, ...campaignData } = data;

    const campaign = await db.campaign.create({
      data: {
        ...campaignData,
        vehicleModels: vehicleModelIds?.length
          ? {
              create: vehicleModelIds.map((vehicleModelId) => ({
                vehicleModelId,
              })),
            }
          : undefined,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        vehicleModels: {
          include: {
            vehicleModel: {
              select: {
                id: true,
                brand: true,
                model: true,
                variant: true,
                year: true,
              },
            },
          },
        },
      },
    });

    return {
      ...campaign,
      vehicleModels: campaign.vehicleModels.map((vm) => vm.vehicleModel),
    };
  }

  /**
   * Update campaign
   */
  async update(id: string, data: UpdateCampaignData) {
    const { vehicleModelIds, ...campaignData } = data;

    // If vehicleModelIds provided, update the relations
    if (vehicleModelIds !== undefined) {
      // Delete existing relations
      await db.campaignVehicleModel.deleteMany({
        where: { campaignId: id },
      });

      // Create new relations
      if (vehicleModelIds.length > 0) {
        await db.campaignVehicleModel.createMany({
          data: vehicleModelIds.map((vehicleModelId) => ({
            campaignId: id,
            vehicleModelId,
          })),
        });
      }
    }

    const campaign = await db.campaign.update({
      where: { id },
      data: campaignData,
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        vehicleModels: {
          include: {
            vehicleModel: {
              select: {
                id: true,
                brand: true,
                model: true,
                variant: true,
                year: true,
              },
            },
          },
        },
      },
    });

    return {
      ...campaign,
      vehicleModels: campaign.vehicleModels.map((vm) => vm.vehicleModel),
    };
  }

  /**
   * Delete campaign
   */
  async delete(id: string) {
    // Check if campaign has sales
    const salesCount = await db.sale.count({
      where: { campaignId: id },
    });

    if (salesCount > 0) {
      throw new Error('Cannot delete campaign with associated sales');
    }

    await db.campaign.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Get vehicle models under a campaign
   */
  async getVehicleModels(campaignId: string) {
    const vehicleModels = await db.campaignVehicleModel.findMany({
      where: { campaignId },
      include: {
        vehicleModel: {
          select: {
            id: true,
            brand: true,
            model: true,
            variant: true,
            year: true,
            price: true,
            type: true,
          },
        },
      },
    });

    return vehicleModels.map((vm) => vm.vehicleModel);
  }

  /**
   * Add vehicle model to campaign
   */
  async addVehicleModel(campaignId: string, vehicleModelId: string) {
    const existing = await db.campaignVehicleModel.findUnique({
      where: {
        campaignId_vehicleModelId: {
          campaignId,
          vehicleModelId,
        },
      },
    });

    if (existing) {
      throw new Error('Vehicle model already in campaign');
    }

    await db.campaignVehicleModel.create({
      data: {
        campaignId,
        vehicleModelId,
      },
    });

    return { success: true };
  }

  /**
   * Remove vehicle model from campaign
   */
  async removeVehicleModel(campaignId: string, vehicleModelId: string) {
    await db.campaignVehicleModel.delete({
      where: {
        campaignId_vehicleModelId: {
          campaignId,
          vehicleModelId,
        },
      },
    });

    return { success: true };
  }

  /**
   * Get campaign analytics
   */
  async getAnalytics(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ analytics: CampaignAnalytics[]; summary: any }> {
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      include: {
        vehicleModels: {
          include: {
            vehicleModel: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Default to campaign period if no dates provided
    const filterStartDate = startDate || campaign.startDate;
    const filterEndDate = endDate || campaign.endDate;

    // Get sales for this campaign within the date range
    const sales = await db.sale.findMany({
      where: {
        campaignId,
        createdAt: {
          gte: filterStartDate,
          lte: filterEndDate,
        },
        status: {
          notIn: ['CANCELLED'],
        },
      },
      include: {
        vehicleModel: {
          select: {
            id: true,
            brand: true,
            model: true,
            variant: true,
            year: true,
          },
        },
        stock: {
          select: {
            vehicleModelId: true,
            vehicleModel: {
              select: {
                id: true,
                brand: true,
                model: true,
                variant: true,
                year: true,
              },
            },
          },
        },
      },
    });

    // Group sales by vehicle model
    const vehicleModelAnalytics = new Map<string, CampaignAnalytics>();

    // Initialize with all vehicle models in campaign
    for (const vm of campaign.vehicleModels) {
      vehicleModelAnalytics.set(vm.vehicleModelId, {
        vehicleModelId: vm.vehicleModelId,
        vehicleModel: {
          id: vm.vehicleModel.id,
          brand: vm.vehicleModel.brand,
          model: vm.vehicleModel.model,
          variant: vm.vehicleModel.variant || undefined,
          year: vm.vehicleModel.year,
        },
        totalSales: 0,
        totalAmount: 0,
        directSales: 0,
        reservationSales: 0,
      });
    }

    // Aggregate sales data
    for (const sale of sales) {
      const vehicleModelId =
        sale.stock?.vehicleModelId || sale.vehicleModelId;
      if (!vehicleModelId) continue;

      const existing = vehicleModelAnalytics.get(vehicleModelId);
      if (existing) {
        existing.totalSales += 1;
        existing.totalAmount += Number(sale.totalAmount);
        if (sale.type === 'DIRECT_SALE') {
          existing.directSales += 1;
        } else {
          existing.reservationSales += 1;
        }
      }
    }

    const analytics = Array.from(vehicleModelAnalytics.values());

    // Calculate summary
    const summary = {
      totalVehicleModels: campaign.vehicleModels.length,
      totalSales: analytics.reduce((sum, a) => sum + a.totalSales, 0),
      totalAmount: analytics.reduce((sum, a) => sum + a.totalAmount, 0),
      directSales: analytics.reduce((sum, a) => sum + a.directSales, 0),
      reservationSales: analytics.reduce(
        (sum, a) => sum + a.reservationSales,
        0
      ),
      periodStart: filterStartDate,
      periodEnd: filterEndDate,
    };

    return { analytics, summary };
  }

  /**
   * Get active campaigns
   */
  async getActiveCampaigns() {
    const now = new Date();
    return db.campaign.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      include: {
        vehicleModels: {
          include: {
            vehicleModel: {
              select: {
                id: true,
                brand: true,
                model: true,
                variant: true,
                year: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Get campaigns for a specific vehicle model
   */
  async getCampaignsForVehicleModel(vehicleModelId: string) {
    const now = new Date();
    const campaigns = await db.campaignVehicleModel.findMany({
      where: {
        vehicleModelId,
        campaign: {
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now },
        },
      },
      include: {
        campaign: true,
      },
    });

    return campaigns.map((c) => c.campaign);
  }
}

export const campaignsService = new CampaignsService();
