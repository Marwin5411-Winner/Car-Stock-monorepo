import type { DebtStatus, Prisma, StockStatus } from '@prisma/client';
import { BadRequestError } from '../../lib/errors';

export const BULK_INTEREST_LIMIT = 500;

export type InterestListFilters = {
  search?: string;
  status?: string;
  isCalculating?: boolean;
};

export type BulkPrincipalChoice = 'KEEP' | 'BASE_COST_ONLY' | 'TOTAL_COST';

export type BulkItemStatus = 'applied' | 'skipped' | 'error';

export type BulkItemResult = {
  stockId: string;
  vin?: string;
  status: BulkItemStatus;
  reason?: string;
};

export type BulkInterestResult = {
  applied: BulkItemResult[];
  skipped: BulkItemResult[];
  errors: BulkItemResult[];
};

export type BulkStockRef = {
  id: string;
  vin: string;
  stopInterestCalc: boolean;
  debtStatus: DebtStatus;
};

export function buildInterestListWhere(filters: InterestListFilters): Prisma.StockWhereInput {
  const where: Prisma.StockWhereInput = { deletedAt: null };
  const and: Prisma.StockWhereInput[] = [];

  if (filters.search) {
    and.push({
      OR: [
        { vin: { contains: filters.search, mode: 'insensitive' } },
        { vehicleModel: { brand: { contains: filters.search, mode: 'insensitive' } } },
        { vehicleModel: { model: { contains: filters.search, mode: 'insensitive' } } },
      ],
    });
  }

  if (filters.status) {
    where.status = filters.status as StockStatus;
  }

  if (filters.isCalculating === true) {
    where.stopInterestCalc = false;
    where.debtStatus = { not: 'PAID_OFF' };
  } else if (filters.isCalculating === false) {
    and.push({
      OR: [{ stopInterestCalc: true }, { debtStatus: 'PAID_OFF' }],
    });
  }

  if (and.length) {
    where.AND = and;
  }

  return where;
}

export function assertBulkStockCount(count: number, limit = BULK_INTEREST_LIMIT): void {
  if (count > limit) {
    throw new BadRequestError(
      `ทำได้สูงสุด ${limit} คันต่อครั้ง (เลือกอยู่ ${count} คัน) กรองให้แคบลงหรือเลือกทีละชุด`
    );
  }
}

export function classifyForStop(stock: BulkStockRef): 'apply' | string {
  if (stock.debtStatus === 'PAID_OFF') return 'ปิดหนี้แล้ว';
  if (stock.stopInterestCalc) return 'หยุดคิดดอกอยู่แล้ว';
  return 'apply';
}

export function classifyForApplyRate(stock: BulkStockRef): 'update' | 'resume' | string {
  if (stock.debtStatus === 'PAID_OFF') return 'ปิดหนี้แล้ว';
  if (stock.stopInterestCalc) return 'resume';
  return 'update';
}

export function resolveBulkRate(
  stockId: string,
  annualRate: number | undefined,
  items?: { stockId: string; annualRate: number; principalBase?: BulkPrincipalChoice }[]
): number {
  const fromItem = items?.find((i) => i.stockId === stockId);
  const rate = fromItem?.annualRate ?? annualRate;
  if (rate == null || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new BadRequestError('กรุณาระบุอัตราดอกเบี้ย 0-100%');
  }
  return rate;
}

export function resolveBulkPrincipalBase(
  stockId: string,
  shared?: BulkPrincipalChoice,
  items?: { stockId: string; principalBase?: BulkPrincipalChoice }[]
): 'BASE_COST_ONLY' | 'TOTAL_COST' | undefined {
  const fromItem = items?.find((i) => i.stockId === stockId);
  const chosen = fromItem?.principalBase ?? shared;
  if (!chosen || chosen === 'KEEP') return undefined;
  return chosen;
}

export function emptyBulkResult(): BulkInterestResult {
  return { applied: [], skipped: [], errors: [] };
}

export function pushBulkItem(
  result: BulkInterestResult,
  item: BulkItemResult
): void {
  if (item.status === 'applied') result.applied.push(item);
  else if (item.status === 'skipped') result.skipped.push(item);
  else result.errors.push(item);
}
