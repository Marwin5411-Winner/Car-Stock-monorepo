export type FormulaOperator = 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'PERCENT' | 'PERCENT_SUBTRACT';

export type FormulaPriceTarget = 'COST_PRICE' | 'SELLING_PRICE';

/**
 * Apply a single formula step to a base value. The five operators mirror the
 * CampaignModelFormula.operator enum. This is the single source of truth for
 * the math — both the API (campaign-formulas.service) and the web preview call
 * it, so they can never drift.
 *
 * No rounding here: per-step 2-decimal rounding is the caller's concern
 * (applyLoadedFormulas), and the preview wants exact intermediate values.
 */
export function applyFormulaStep(
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
    case 'PERCENT_SUBTRACT':
      return baseValue - (baseValue * formulaValue) / 100;
    default:
      return baseValue;
  }
}
