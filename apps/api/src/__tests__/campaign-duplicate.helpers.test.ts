import { describe, expect, it } from 'bun:test';
import {
  shiftToNextMonth,
  buildClonedCampaign,
  type CloneSource,
} from '../modules/campaigns/campaign-duplicate.helpers';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('shiftToNextMonth', () => {
  it('adds one month keeping the day-of-month', () => {
    const r = shiftToNextMonth(new Date(Date.UTC(2026, 5, 1)), new Date(Date.UTC(2026, 5, 30)));
    expect(iso(r.startDate)).toBe('2026-07-01');
    expect(iso(r.endDate)).toBe('2026-07-30');
  });

  it('clamps the day to the target month length (Jan 31 -> Feb 28 non-leap)', () => {
    const r = shiftToNextMonth(new Date(Date.UTC(2026, 0, 31)), new Date(Date.UTC(2026, 0, 31)));
    expect(iso(r.startDate)).toBe('2026-02-28');
    expect(iso(r.endDate)).toBe('2026-02-28');
  });

  it('clamps to Feb 29 in a leap year', () => {
    const r = shiftToNextMonth(new Date(Date.UTC(2024, 0, 31)), new Date(Date.UTC(2024, 0, 31)));
    expect(iso(r.startDate)).toBe('2024-02-29');
  });

  it('rolls the year over for December', () => {
    const r = shiftToNextMonth(new Date(Date.UTC(2026, 11, 15)), new Date(Date.UTC(2026, 11, 20)));
    expect(iso(r.startDate)).toBe('2027-01-15');
    expect(iso(r.endDate)).toBe('2027-01-20');
  });
});

describe('buildClonedCampaign', () => {
  const source: CloneSource = {
    name: 'โปรเดือนมิถุนา',
    description: 'desc',
    branch: 'สำนักงานใหญ่',
    notes: 'note',
    startDate: new Date(Date.UTC(2026, 5, 1)),
    endDate: new Date(Date.UTC(2026, 5, 30)),
    vehicleModelIds: ['m1', 'm2'],
    formulas: [
      { vehicleModelId: 'm1', name: 'ลด 2%', operator: 'PERCENT', value: 2, priceTarget: 'COST_PRICE', sortOrder: 0 },
      { vehicleModelId: 'm2', name: 'แถม', operator: 'FIXED', value: 20000, priceTarget: 'SELLING_PRICE', sortOrder: 1 },
    ],
  };

  it('suffixes the name, resets to DRAFT, and shifts dates to next month', () => {
    const c = buildClonedCampaign(source);
    expect(c.name).toBe('โปรเดือนมิถุนา (สำเนา)');
    expect(c.status).toBe('DRAFT');
    expect(iso(c.startDate)).toBe('2026-07-01');
    expect(iso(c.endDate)).toBe('2026-07-30');
  });

  it('copies branch, notes, description, models, and all formulas verbatim', () => {
    const c = buildClonedCampaign(source);
    expect(c.branch).toBe('สำนักงานใหญ่');
    expect(c.notes).toBe('note');
    expect(c.description).toBe('desc');
    expect(c.vehicleModelIds).toEqual(['m1', 'm2']);
    expect(c.formulas).toEqual(source.formulas);
  });
});
