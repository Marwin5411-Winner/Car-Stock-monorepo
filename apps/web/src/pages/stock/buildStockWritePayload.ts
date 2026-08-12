import {
  isValidInterestPercent,
  percentToInterestRate,
  type CreateStockStatusValue,
} from '@car-stock/shared/constants';
import type { CreateStockData, UpdateStockData } from '../../services/stock.service';

/** Form field shape used by StockFormPage (UI percent for interestRate). */
export type StockFormFields = {
  vin: string;
  engineNumber: string;
  motorNumber1: string;
  motorNumber2: string;
  vehicleModelId: string;
  exteriorColor: string;
  interiorColor: string;
  arrivalDate: string;
  orderDate: string;
  parkingSlot: string;
  baseCost: number | '';
  transportCost: number | '';
  accessoryCost: number | '';
  otherCosts: number | '';
  financeProvider: string;
  interestRate: number | '';
  interestPrincipalBase: 'BASE_COST_ONLY' | 'TOTAL_COST';
  expectedSalePrice: number | '';
  notes: string;
};

export type BuildStockWritePayloadResult =
  | { ok: true; mode: 'create'; data: CreateStockData }
  | { ok: true; mode: 'edit'; data: UpdateStockData }
  | { ok: false; message: string; field?: string };

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalNonNegative(value: number | ''): number {
  if (value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildSharedFields(form: StockFormFields) {
  const expectedSalePrice =
    form.expectedSalePrice === '' ? undefined : Number(form.expectedSalePrice);

  return {
    engineNumber: optionalText(form.engineNumber),
    motorNumber1: optionalText(form.motorNumber1),
    motorNumber2: optionalText(form.motorNumber2),
    exteriorColor: form.exteriorColor.trim(),
    interiorColor: optionalText(form.interiorColor),
    parkingSlot: optionalText(form.parkingSlot),
    financeProvider: optionalText(form.financeProvider),
    notes: optionalText(form.notes),
    interestPrincipalBase: form.interestPrincipalBase,
    baseCost: Number(form.baseCost),
    transportCost: optionalNonNegative(form.transportCost),
    accessoryCost: optionalNonNegative(form.accessoryCost),
    otherCosts: optionalNonNegative(form.otherCosts),
    interestRate: percentToInterestRate(
      form.interestRate === '' ? 0 : Number(form.interestRate)
    ),
    ...(expectedSalePrice !== undefined ? { expectedSalePrice } : {}),
    ...(form.orderDate ? { orderDate: new Date(form.orderDate) } : {}),
    ...(form.arrivalDate ? { arrivalDate: new Date(form.arrivalDate) } : {}),
  };
}

/**
 * Build create/update stock API payload from form state.
 * Interest in the form is percent-per-year; output uses API fraction.
 * Empty dates are omitted (not null / not '').
 */
export function buildStockWritePayload(
  form: StockFormFields,
  options: { mode: 'create' | 'edit'; createStatus?: CreateStockStatusValue }
): BuildStockWritePayloadResult {
  const interestPercent = form.interestRate === '' ? 0 : Number(form.interestRate);
  if (!isValidInterestPercent(interestPercent)) {
    return {
      ok: false,
      field: 'interestRate',
      message:
        'กรุณากรอกอัตราดอกเบี้ยเป็นเปอร์เซ็นต์ เช่น 6.5 หมายถึง 6.5% ต่อปี (ช่วง 0–100)',
    };
  }

  if (!form.vehicleModelId.trim()) {
    return {
      ok: false,
      field: 'vehicleModelId',
      message: 'กรุณาเลือกรุ่นรถ',
    };
  }

  if (!form.vin.trim()) {
    return {
      ok: false,
      field: 'vin',
      message: 'กรุณากรอกหมายเลข VIN / เลขตัวถัง',
    };
  }

  if (!form.exteriorColor.trim()) {
    return {
      ok: false,
      field: 'exteriorColor',
      message: 'กรุณากรอกสีภายนอก',
    };
  }

  if (form.baseCost === '' || !Number.isFinite(Number(form.baseCost)) || Number(form.baseCost) <= 0) {
    return {
      ok: false,
      field: 'baseCost',
      message: 'กรุณากรอกต้นทุนฐานให้ถูกต้อง (มากกว่า 0)',
    };
  }

  const expectedSalePrice =
    form.expectedSalePrice === '' ? undefined : Number(form.expectedSalePrice);
  if (expectedSalePrice !== undefined && (!Number.isFinite(expectedSalePrice) || expectedSalePrice <= 0)) {
    return {
      ok: false,
      field: 'expectedSalePrice',
      message: 'ราคาขายคาดการณ์ต้องเป็นตัวเลขมากกว่า 0',
    };
  }

  const shared = buildSharedFields(form);

  if (options.mode === 'edit') {
    return { ok: true, mode: 'edit', data: shared };
  }

  return {
    ok: true,
    mode: 'create',
    data: {
      ...shared,
      vin: form.vin.trim(),
      vehicleModelId: form.vehicleModelId.trim(),
      status: options.createStatus ?? 'AVAILABLE',
    },
  };
}
