import { db } from '../../lib/db';
import { NotFoundError, BadRequestError } from '../../lib/errors';
import { FormulaOperator, FormulaPriceTarget } from '@prisma/client';
import { applyFormulaStep, sumCampaignSubsidies } from '@car-stock/shared/formulas';

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
    return applyFormulaStep(baseValue, operator, formulaValue);
  }

  /**
   * @deprecated Price-chain model. Production now uses the additive expense
   * engine (`sumCampaignSubsidies`). Retained only for its direct unit tests.
   *
   * Apply pre-loaded formulas to a (costPrice, sellingPrice) pair. Pure
   * computation — no DB access. Returns adjusted prices and a per-step
   * trace so callers that need to render the breakdown (e.g. the campaign
   * report PDF) don't have to re-implement the loop.
   *
   * Each step is rounded to 2 decimals to prevent float drift from
   * compounding across many cars and showing up as fractional-baht
   * mismatches when the supplier reconciles totals.
   */
  applyLoadedFormulas(
    formulas: Array<{
      id: string;
      name: string;
      operator: FormulaOperator;
      // Accepts Prisma.Decimal or number — we always coerce.
      value: { toString(): string } | number;
      priceTarget: FormulaPriceTarget;
      sortOrder: number;
    }>,
    costPrice: number,
    sellingPrice: number
  ) {
    let adjustedCostPrice = costPrice;
    let adjustedSellingPrice = sellingPrice;

    const sorted = [...formulas].sort((a, b) => a.sortOrder - b.sortOrder);
    const formulaResults: Array<{
      formulaId: string;
      name: string;
      operator: FormulaOperator;
      value: number;
      priceTarget: FormulaPriceTarget;
      sortOrder: number;
      resultValue: number;
    }> = [];

    const round2 = (n: number) => Math.round(n * 100) / 100;

    for (const formula of sorted) {
      const value = Number(formula.value);
      const target = formula.priceTarget;
      const baseVal = target === 'COST_PRICE' ? adjustedCostPrice : adjustedSellingPrice;
      const result = round2(this.calculateFormulaValue(baseVal, formula.operator, value));

      if (target === 'COST_PRICE') {
        adjustedCostPrice = result;
      } else {
        adjustedSellingPrice = result;
      }

      formulaResults.push({
        formulaId: formula.id,
        name: formula.name,
        operator: formula.operator,
        value,
        priceTarget: target,
        sortOrder: formula.sortOrder,
        resultValue: result,
      });
    }

    return {
      originalCostPrice: costPrice,
      originalSellingPrice: sellingPrice,
      adjustedCostPrice,
      adjustedSellingPrice,
      costPriceDiff: round2(adjustedCostPrice - costPrice),
      sellingPriceDiff: round2(adjustedSellingPrice - sellingPrice),
      formulaResults,
    };
  }

  /**
   * @deprecated See applyLoadedFormulas — superseded by the expense-sum engine.
   *
   * Apply all formulas for a campaign vehicle model to cost and selling prices.
   * Thin wrapper that fetches formulas and delegates to applyLoadedFormulas.
   */
  async applyFormulas(
    campaignId: string,
    vehicleModelId: string,
    costPrice: number,
    sellingPrice: number
  ) {
    const formulas = await this.getFormulas(campaignId, vehicleModelId);
    const applied = this.applyLoadedFormulas(formulas, costPrice, sellingPrice);
    return { ...applied, formulas };
  }

  /**
   * Per-car campaign subsidy total for a sale, or null when there is no
   * campaign / model. cost = stock.baseCost, selling = vehicleModel.price.
   */
  async computeSaleSubsidySnapshot(params: {
    campaignId: string | null | undefined;
    vehicleModelId: string | null | undefined;
    stockId: string | null | undefined;
  }): Promise<number | null> {
    const { campaignId } = params;
    if (!campaignId) return null;

    let vehicleModelId = params.vehicleModelId ?? null;
    let cost = 0;
    if (params.stockId) {
      const stock = await db.stock.findUnique({
        where: { id: params.stockId },
        select: { baseCost: true, vehicleModelId: true },
      });
      cost = stock ? Number(stock.baseCost) : 0;
      vehicleModelId = vehicleModelId ?? stock?.vehicleModelId ?? null;
    }
    if (!vehicleModelId) return null;

    const [formulas, vm] = await Promise.all([
      this.getFormulas(campaignId, vehicleModelId),
      db.vehicleModel.findUnique({ where: { id: vehicleModelId }, select: { price: true } }),
    ]);
    if (formulas.length === 0) return 0;

    const selling = vm ? Number(vm.price) : 0;
    return sumCampaignSubsidies(
      formulas.map((f) => ({
        operator: f.operator,
        value: Number(f.value),
        priceTarget: f.priceTarget,
      })),
      { cost, selling }
    );
  }
}

export const campaignFormulasService = new CampaignFormulasService();
