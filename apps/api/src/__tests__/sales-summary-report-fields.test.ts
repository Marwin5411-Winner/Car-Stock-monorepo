import { describe, expect, it } from 'bun:test';

function computeTransportFee(input: {
  registrationFee?: number | null;
  compulsoryInsuranceFee?: number | null;
}): number {
  return (input.registrationFee || 0) + (input.compulsoryInsuranceFee || 0);
}

describe('monthly sales report — per-sale money mapping', () => {
  // netProfit / net-discount / subsidy math now lives in computeSaleMoney and is
  // tested against the real helper in reports-helpers.test.ts (no mirror here).

  it('ทะเบียน/พรบ/ขนส่ง column = registrationFee + compulsoryInsuranceFee', () => {
    expect(computeTransportFee({ registrationFee: 2_400, compulsoryInsuranceFee: 600 })).toBe(3_000);
    expect(computeTransportFee({})).toBe(0);
  });
});
