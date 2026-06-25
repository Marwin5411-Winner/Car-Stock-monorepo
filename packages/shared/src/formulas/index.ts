export type FormulaOperator =
  | 'ADD'
  | 'SUBTRACT'
  | 'MULTIPLY'
  | 'PERCENT'
  | 'PERCENT_SUBTRACT'
  | 'FIXED';

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

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Per-row campaign SUBSIDY amount (a positive per-car amount), used by the
 * sale snapshot + campaign-detail total. Distinct from applyFormulaStep:
 * here rows do NOT chain — each is an independent amount that callers sum.
 *  - PERCENT / PERCENT_SUBTRACT → magnitude % of the chosen base
 *  - FIXED / ADD / SUBTRACT     → the flat value (base-independent)
 *  - MULTIPLY                   → 0 (not meaningful as a subsidy)
 */
export function formulaSubsidyAmount(
  operator: FormulaOperator,
  value: number,
  priceTarget: FormulaPriceTarget,
  bases: { cost: number; selling: number }
): number {
  const v = Number.isFinite(value) ? value : 0;
  switch (operator) {
    case 'PERCENT':
    case 'PERCENT_SUBTRACT': {
      const base = priceTarget === 'COST_PRICE' ? bases.cost : bases.selling;
      return round2((base * v) / 100);
    }
    case 'FIXED':
    case 'ADD':
    case 'SUBTRACT':
      return round2(v);
    default:
      return 0; // MULTIPLY and any future operator contribute nothing
  }
}

/** Sum of every row's subsidy amount for one vehicle model. */
export function sumCampaignSubsidies(
  formulas: Array<{ operator: FormulaOperator; value: number; priceTarget: FormulaPriceTarget }>,
  bases: { cost: number; selling: number }
): number {
  return round2(
    formulas.reduce(
      (sum, f) => sum + formulaSubsidyAmount(f.operator, f.value, f.priceTarget, bases),
      0
    )
  );
}
