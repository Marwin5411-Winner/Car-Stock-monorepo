import type { FormulaOperator, FormulaPriceTarget } from '@prisma/client';

/** Add one month to a date using UTC parts, clamping the day to the target
 * month's last day (avoids the UTC-vs-local-midnight off-by-one). */
function addOneMonthClampedUTC(d: Date): Date {
  const year = d.getUTCFullYear();
  const monthAbs = d.getUTCMonth() + 1; // 0-11 -> next month (may be 12)
  const targetYear = year + Math.floor(monthAbs / 12);
  const targetMonth = monthAbs % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

export function shiftToNextMonth(start: Date, end: Date): { startDate: Date; endDate: Date } {
  return { startDate: addOneMonthClampedUTC(start), endDate: addOneMonthClampedUTC(end) };
}

export interface CloneSourceFormula {
  vehicleModelId: string;
  name: string;
  operator: FormulaOperator;
  value: number;
  priceTarget: FormulaPriceTarget;
  sortOrder: number;
}

export interface CloneSource {
  name: string;
  description: string | null;
  branch: string | null;
  notes: string | null;
  startDate: Date;
  endDate: Date;
  vehicleModelIds: string[];
  formulas: CloneSourceFormula[];
}

export interface ClonedCampaign {
  name: string;
  description: string | null;
  branch: string | null;
  notes: string | null;
  status: 'DRAFT';
  startDate: Date;
  endDate: Date;
  vehicleModelIds: string[];
  formulas: CloneSourceFormula[];
}

/** Pure transform: source campaign -> the data for its duplicate. */
export function buildClonedCampaign(source: CloneSource): ClonedCampaign {
  const { startDate, endDate } = shiftToNextMonth(source.startDate, source.endDate);
  return {
    name: `${source.name} (สำเนา)`,
    description: source.description,
    branch: source.branch,
    notes: source.notes,
    status: 'DRAFT',
    startDate,
    endDate,
    vehicleModelIds: [...source.vehicleModelIds],
    formulas: source.formulas.map((f) => ({ ...f })),
  };
}
