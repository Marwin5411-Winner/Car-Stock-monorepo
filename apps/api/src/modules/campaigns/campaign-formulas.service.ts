import { db } from '../../lib/db';
import { NotFoundError, BadRequestError } from '../../lib/errors';
import { FormulaOperator, FormulaPriceTarget } from '@prisma/client';

interface CreateFormulaData {
  campaignId: string;
  vehicleModelId: string;
  name: string;
  operator: FormulaOperator;
  value: number;
  priceTarget: FormulaPriceTarget;
  sortOrder?: number;
}

interface UpdateFormulaData {
  name?: string;
  operator?: FormulaOperator;
  value?: number;
  priceTarget?: FormulaPriceTarget;
  sortOrder?: number;
}

interface ReorderData {
  formulaId: string;
  sortOrder: number;
}

class CampaignFormulasService {
  /**
   * Get all formulas for a campaign vehicle model
   */
  async getFormulas(campaignId: string, vehicleModelId: string) {
    return db.campaignModelFormula.findMany({
      where: { campaignId, vehicleModelId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Get all formulas for a campaign (all vehicle models)
   */
  async getAllFormulasForCampaign(campaignId: string) {
    return db.campaignModelFormula.findMany({
      where: { campaignId },
      orderBy: [{ vehicleModelId: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  /**
   * Create a new formula
   */
  async create(data: CreateFormulaData) {
    // Verify CampaignVehicleModel exists
    const cvm = await db.campaignVehicleModel.findUnique({
      where: {
        campaignId_vehicleModelId: {
          campaignId: data.campaignId,
          vehicleModelId: data.vehicleModelId,
        },
      },
    });

    if (!cvm) {
      throw new NotFoundError('Campaign Vehicle Model relationship');
    }

    // Auto-assign sortOrder if not provided
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const maxOrder = await db.campaignModelFormula.findFirst({
        where: {
          campaignId: data.campaignId,
          vehicleModelId: data.vehicleModelId,
        },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      sortOrder = (maxOrder?.sortOrder ?? 0) + 1;
    }

    return db.campaignModelFormula.create({
      data: {
        campaignId: data.campaignId,
        vehicleModelId: data.vehicleModelId,
        name: data.name,
        operator: data.operator,
        value: data.value,
        priceTarget: data.priceTarget,
        sortOrder,
      },
    });
  }

  /**
   * Update a formula
   */
  async update(id: string, data: UpdateFormulaData) {
    const existing = await db.campaignModelFormula.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('Campaign Formula');
    }

    return db.campaignModelFormula.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a formula
   */
  async delete(id: string) {
    const existing = await db.campaignModelFormula.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('Campaign Formula');
    }

    await db.campaignModelFormula.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Reorder formulas for a campaign vehicle model
   */
  async reorder(campaignId: string, vehicleModelId: string, items: ReorderData[]) {
    await db.$transaction(
      items.map((item) =>
        db.campaignModelFormula.update({
          where: { id: item.formulaId },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    return this.getFormulas(campaignId, vehicleModelId);
  }

  /**
   * Calculate formula result given a base value
   */
  calculateFormulaValue(
    baseValue: number,
    operator: FormulaOperator,
    formulaValue: number
  ): number {
    switch (operator) {
      case 'ADD':
        return baseValue + formulaValue;
      case 'SUBTRACT':
        return baseValue - formulaValue;
      case 'MULTIPLY':
        return baseValue * formulaValue;
      case 'PERCENT':
        return baseValue + (baseValue * formulaValue) / 100;
      default:
        return baseValue;
    }
  }

  /**
   * Apply all formulas for a campaign vehicle model to cost and selling prices
   */
  async applyFormulas(
    campaignId: string,
    vehicleModelId: string,
    costPrice: number,
    sellingPrice: number
  ) {
    const formulas = await this.getFormulas(campaignId, vehicleModelId);

    let adjustedCostPrice = costPrice;
    let adjustedSellingPrice = sellingPrice;

    for (const formula of formulas) {
      const value = Number(formula.value);
      if (formula.priceTarget === 'COST_PRICE') {
        adjustedCostPrice = this.calculateFormulaValue(adjustedCostPrice, formula.operator, value);
      } else {
        adjustedSellingPrice = this.calculateFormulaValue(adjustedSellingPrice, formula.operator, value);
      }
    }

    return {
      originalCostPrice: costPrice,
      originalSellingPrice: sellingPrice,
      adjustedCostPrice,
      adjustedSellingPrice,
      costPriceDiff: adjustedCostPrice - costPrice,
      sellingPriceDiff: adjustedSellingPrice - sellingPrice,
      formulas,
    };
  }
}

export const campaignFormulasService = new CampaignFormulasService();
