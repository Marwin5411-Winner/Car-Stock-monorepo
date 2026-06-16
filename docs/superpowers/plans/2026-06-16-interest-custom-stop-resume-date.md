# Custom Stop/Resume Interest Date (Phase 1 — back-date) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ใช้เลือก "วันที่หยุด" และ "วันที่เริ่มคิดดอกเบี้ยใหม่" ได้เอง โดยจำกัด ≤ วันนี้ (back-date) เพื่อแก้เคสน้องลืมกดหยุดแล้วดอกเบี้ยคิดเกิน

**Architecture:** ขยาย flow stop/resume ที่มีอยู่ ให้รับวันที่จาก UI → validate ช่วงวัน (client + server) → service ปิด/เปิด period ที่วันที่เลือก ทุกวันที่ ≤ วันนี้ จึงไม่กระทบการคำนวณดอกเบี้ยในโมดูลอื่น (reports/pdf/stock)

**Tech Stack:** ElysiaJS + Prisma (API), React 19 + Tailwind + Radix (web), Bun test (pure-logic tests), date-fns (DatePicker)

**Spec:** `docs/superpowers/specs/2026-06-16-interest-custom-stop-resume-date-design.md`

---

## File Structure

**Create:**
- `apps/api/src/modules/interest/interest.dates.ts` — pure date validators (server)
- `apps/api/src/__tests__/interest-dates.test.ts` — tests for server validators
- `apps/web/src/components/interest/StopInterestModal.tsx` — stop modal with date picker

**Modify:**
- `apps/web/src/components/ui/date-picker.tsx` — add `minDate`/`maxDate` props
- `apps/web/src/pages/interest/interestActions.ts` — add client date validators
- `apps/web/src/pages/interest/interestActions.test.ts` — tests for client validators
- `apps/api/src/modules/interest/interest.service.ts` — validate stopDate; add `startDate` to resume
- `apps/api/src/modules/interest/interest.controller.ts` — body schemas + pass-through + `requester.id` fix
- `apps/web/src/services/interest.service.ts` — `stopCalculation(..., stopDate?)` + `ResumeInterestData.startDate`
- `apps/web/src/pages/interest/InterestDetailPage.tsx` — wire stop modal
- `apps/web/src/pages/interest/InterestEditPage.tsx` — show start-date field in resume mode

---

## Task 1: DatePicker `minDate`/`maxDate` support

**Files:**
- Modify: `apps/web/src/components/ui/date-picker.tsx`

- [ ] **Step 1: Add props to the interface**

In `interface DatePickerProps`, add two optional ISO-string bounds:

```ts
interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  inputClassName?: string;
  minDate?: string; // ISO yyyy-MM-dd; days before this are disabled
  maxDate?: string; // ISO yyyy-MM-dd; days after this are disabled
}
```

- [ ] **Step 2: Destructure the new props**

Update the function signature destructuring:

```ts
export function DatePicker({
  value,
  onChange,
  placeholder = 'วว/ดด/ปปปป',
  className,
  inputClassName,
  disabled,
  clearable = false,
  minDate,
  maxDate,
}: DatePickerProps) {
```

- [ ] **Step 3: Add an out-of-range helper (inside the component, after `displayValue`)**

ISO `yyyy-MM-dd` strings are lexicographically ordered, so compare formatted day strings directly:

```ts
  const isOutOfRange = (d: Date): boolean => {
    const key = format(d, ISO_FORMAT);
    if (minDate && key < minDate) return true;
    if (maxDate && key > maxDate) return true;
    return false;
  };
```

- [ ] **Step 4: Disable out-of-range day buttons**

In the day-grid `.map`, compute `disabled` and guard the click. Replace the existing day `<button>` block with:

```tsx
            {days.map((day) => {
              const inMonth = isSameMonth(day, viewMonth);
              const isSelected = selected && isSameDay(day, selected);
              const isToday = isSameDay(day, today);
              const outOfRange = isOutOfRange(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={outOfRange}
                  onClick={() => !outOfRange && handleSelect(day)}
                  className={cn(
                    'h-8 w-full text-sm rounded transition-colors',
                    !inMonth && 'text-gray-300',
                    inMonth && !isSelected && !outOfRange && 'text-gray-800 hover:bg-blue-50',
                    isSelected && 'bg-blue-600 text-white font-medium',
                    !isSelected && isToday && !outOfRange && 'ring-1 ring-blue-400',
                    outOfRange && 'text-gray-300 cursor-not-allowed opacity-50'
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
```

- [ ] **Step 5: Disable the "วันนี้" quick button when today is out of range**

Replace the "วันนี้" button with:

```tsx
            <button
              type="button"
              disabled={isOutOfRange(today)}
              onClick={() => {
                handleSelect(today);
                setViewMonth(today);
              }}
              className="text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
            >
              วันนี้
            </button>
```

- [ ] **Step 6: Verify typecheck**

Run: `cd apps/web && bunx tsc -b`
Expected: no errors (exit 0)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ui/date-picker.tsx
git commit -m "feat(web): DatePicker minDate/maxDate to disable out-of-range days"
```

---

## Task 2: Client-side date validators (pure, TDD)

**Files:**
- Modify: `apps/web/src/pages/interest/interestActions.ts`
- Test: `apps/web/src/pages/interest/interestActions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/pages/interest/interestActions.test.ts` (and add the two names to the existing top import from `'./interestActions'`):

```ts
import { isValidStopDate, isValidResumeStartDate } from './interestActions';

describe('isValidStopDate', () => {
  const today = '2026-06-16';
  const periodStart = '2026-06-01';

  it('accepts a date between period start and today (inclusive)', () => {
    expect(isValidStopDate('2026-06-10', periodStart, today)).toBe(true);
    expect(isValidStopDate(periodStart, periodStart, today)).toBe(true);
    expect(isValidStopDate(today, periodStart, today)).toBe(true);
  });

  it('rejects a date before the active period start', () => {
    expect(isValidStopDate('2026-05-31', periodStart, today)).toBe(false);
  });

  it('rejects a future date', () => {
    expect(isValidStopDate('2026-06-17', periodStart, today)).toBe(false);
  });

  it('only enforces the upper bound when there is no active period start', () => {
    expect(isValidStopDate('2020-01-01', null, today)).toBe(true);
    expect(isValidStopDate('2026-06-17', null, today)).toBe(false);
  });

  it('normalizes full ISO datetime inputs to the date portion', () => {
    expect(isValidStopDate('2026-06-10T00:00:00.000Z', '2026-06-01T00:00:00.000Z', today)).toBe(true);
  });
});

describe('isValidResumeStartDate', () => {
  const today = '2026-06-16';
  const lastStop = '2026-06-10';

  it('accepts a date between last stop and today (inclusive)', () => {
    expect(isValidResumeStartDate('2026-06-12', lastStop, today)).toBe(true);
    expect(isValidResumeStartDate(lastStop, lastStop, today)).toBe(true);
    expect(isValidResumeStartDate(today, lastStop, today)).toBe(true);
  });

  it('rejects a date before the last stop date', () => {
    expect(isValidResumeStartDate('2026-06-09', lastStop, today)).toBe(false);
  });

  it('rejects a future date', () => {
    expect(isValidResumeStartDate('2026-06-17', lastStop, today)).toBe(false);
  });

  it('only enforces the upper bound when there is no last stop date', () => {
    expect(isValidResumeStartDate('2020-01-01', null, today)).toBe(true);
    expect(isValidResumeStartDate('2026-06-17', null, today)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test apps/web/src/pages/interest/interestActions.test.ts`
Expected: FAIL — `isValidStopDate`/`isValidResumeStartDate` are not exported (import error)

- [ ] **Step 3: Implement the validators**

Append to `apps/web/src/pages/interest/interestActions.ts`:

```ts
/** Reduce an ISO date or datetime string to its yyyy-MM-dd day portion. */
const toDay = (iso: string | null | undefined): string => (iso ?? '').slice(0, 10);

/** Inclusive day-range check on ISO date strings (empty bound = unbounded). */
function withinDayRange(
  dateIso: string,
  minIso: string | null | undefined,
  maxIso: string | null | undefined,
): boolean {
  const d = toDay(dateIso);
  if (!d) return false;
  const min = toDay(minIso);
  const max = toDay(maxIso);
  if (min && d < min) return false;
  if (max && d > max) return false;
  return true;
}

/** Stop date must be within [active period start, today]. */
export function isValidStopDate(
  stopDate: string,
  activePeriodStart: string | null | undefined,
  today: string,
): boolean {
  return withinDayRange(stopDate, activePeriodStart, today);
}

/** Resume start date must be within [last stop date, today]. */
export function isValidResumeStartDate(
  startDate: string,
  lastStopDate: string | null | undefined,
  today: string,
): boolean {
  return withinDayRange(startDate, lastStopDate, today);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test apps/web/src/pages/interest/interestActions.test.ts`
Expected: PASS (all tests, including the pre-existing gating tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/interest/interestActions.ts apps/web/src/pages/interest/interestActions.test.ts
git commit -m "feat(web): pure date validators for interest stop/resume"
```

---

## Task 3: Server-side date validators (pure, TDD)

**Files:**
- Create: `apps/api/src/modules/interest/interest.dates.ts`
- Test: `apps/api/src/__tests__/interest-dates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/interest-dates.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { dayKey, isValidStopDate, isValidResumeStartDate } from '../modules/interest/interest.dates';

describe('dayKey', () => {
  it('formats a Date as a local yyyy-MM-dd string', () => {
    // Local-midnight date → its own calendar day (no UTC shift)
    const d = new Date(2026, 5, 10, 0, 0, 0, 0); // 10 June 2026 local
    expect(dayKey(d)).toBe('2026-06-10');
  });

  it('slices an ISO string to its date portion', () => {
    expect(dayKey('2026-06-10T17:00:00.000Z')).toBe('2026-06-10');
    expect(dayKey('2026-06-10')).toBe('2026-06-10');
  });
});

describe('isValidStopDate', () => {
  const today = '2026-06-16';
  const periodStart = '2026-06-01';

  it('accepts dates within [period start, today] inclusive', () => {
    expect(isValidStopDate('2026-06-10', periodStart, today)).toBe(true);
    expect(isValidStopDate(periodStart, periodStart, today)).toBe(true);
    expect(isValidStopDate(today, periodStart, today)).toBe(true);
  });

  it('rejects before period start and after today', () => {
    expect(isValidStopDate('2026-05-31', periodStart, today)).toBe(false);
    expect(isValidStopDate('2026-06-17', periodStart, today)).toBe(false);
  });

  it('enforces only the upper bound when no active period', () => {
    expect(isValidStopDate('2020-01-01', null, today)).toBe(true);
    expect(isValidStopDate('2026-06-17', null, today)).toBe(false);
  });
});

describe('isValidResumeStartDate', () => {
  const today = '2026-06-16';
  const lastStop = '2026-06-10';

  it('accepts dates within [last stop, today] inclusive', () => {
    expect(isValidResumeStartDate('2026-06-12', lastStop, today)).toBe(true);
    expect(isValidResumeStartDate(lastStop, lastStop, today)).toBe(true);
    expect(isValidResumeStartDate(today, lastStop, today)).toBe(true);
  });

  it('rejects before last stop and after today', () => {
    expect(isValidResumeStartDate('2026-06-09', lastStop, today)).toBe(false);
    expect(isValidResumeStartDate('2026-06-17', lastStop, today)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && bun test src/__tests__/interest-dates.test.ts`
Expected: FAIL — module `interest.dates` not found

- [ ] **Step 3: Implement the module**

Create `apps/api/src/modules/interest/interest.dates.ts`:

```ts
/**
 * Pure, inclusive day-range validators for interest stop/resume actions.
 * All comparisons are at day granularity on yyyy-MM-dd strings.
 */

/** Reduce a Date (local calendar day) or ISO string to a yyyy-MM-dd day key. */
export function dayKey(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Stop date must be within [active period start, today] (empty bound = unbounded). */
export function isValidStopDate(
  stopDate: string,
  activePeriodStart: string | null,
  today: string,
): boolean {
  if (stopDate > today) return false;
  if (activePeriodStart && stopDate < activePeriodStart) return false;
  return true;
}

/** Resume start date must be within [last stop date, today]. */
export function isValidResumeStartDate(
  startDate: string,
  lastStopDate: string | null,
  today: string,
): boolean {
  if (startDate > today) return false;
  if (lastStopDate && startDate < lastStopDate) return false;
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && bun test src/__tests__/interest-dates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/interest/interest.dates.ts apps/api/src/__tests__/interest-dates.test.ts
git commit -m "feat(api): pure date validators for interest stop/resume"
```

---

## Task 4: Service — validate stop date, add resume start date

**Files:**
- Modify: `apps/api/src/modules/interest/interest.service.ts`

- [ ] **Step 1: Import the validators**

At the top of `interest.service.ts`, add below the existing `errors` import:

```ts
import { dayKey, isValidStopDate, isValidResumeStartDate } from './interest.dates';
```

- [ ] **Step 2: Validate stopDate in `stopInterestCalculation`**

In `stopInterestCalculation`, find:

```ts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveStopDate = stopDate || today;

    // Close active period if exists
    const activePeriod = stock.interestPeriods[0];
```

Replace with (move `activePeriod` up, add validation):

```ts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveStopDate = stopDate || today;

    // Close active period if exists
    const activePeriod = stock.interestPeriods[0];

    // Validate a caller-supplied back-date: must be within [period start, today].
    if (stopDate) {
      const ok = isValidStopDate(
        dayKey(effectiveStopDate),
        activePeriod ? dayKey(activePeriod.startDate) : null,
        dayKey(today),
      );
      if (!ok) {
        throw new BadRequestError(
          'วันที่หยุดต้องไม่เกินวันนี้ และไม่ก่อนวันเริ่มคิดดอกเบี้ยของงวดปัจจุบัน',
        );
      }
    }
```

- [ ] **Step 3: Add `startDate` to the resume input type**

In `resumeInterestCalculation`, change the `input` parameter type:

```ts
  async resumeInterestCalculation(
    stockId: string,
    input: {
      annualRate: number;
      principalBase?: InterestBase;
      notes?: string;
      startDate?: Date;
    },
    userId: string
  ): Promise<InterestPeriodDetail> {
```

- [ ] **Step 4: Validate and use the resume start date**

In `resumeInterestCalculation`, find:

```ts
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const principalBase = input.principalBase || stock.interestPrincipalBase;
    const principalAmount = this.getPrincipalAmount(stock, principalBase);

    // Create new period
    const newPeriod = await db.interestPeriod.create({
      data: {
        stockId,
        startDate: today,
```

Replace with:

```ts
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const effectiveStartDate = input.startDate || today;

    // Validate a caller-supplied back-date: must be within [last stop date, today].
    if (input.startDate) {
      const ok = isValidResumeStartDate(
        dayKey(effectiveStartDate),
        stock.interestStoppedAt ? dayKey(stock.interestStoppedAt) : null,
        dayKey(today),
      );
      if (!ok) {
        throw new BadRequestError(
          'วันที่เริ่มคิดดอกเบี้ยใหม่ต้องไม่เกินวันนี้ และไม่ก่อนวันที่หยุดล่าสุด',
        );
      }
    }

    const principalBase = input.principalBase || stock.interestPrincipalBase;
    const principalAmount = this.getPrincipalAmount(stock, principalBase);

    // Create new period
    const newPeriod = await db.interestPeriod.create({
      data: {
        stockId,
        startDate: effectiveStartDate,
```

- [ ] **Step 5: Verify typecheck**

Run: `cd apps/api && bunx tsc --noEmit`
Expected: no errors (exit 0)

- [ ] **Step 6: Run the full api test suite (no regressions)**

Run: `cd apps/api && bun test`
Expected: PASS (existing interest tests + new interest-dates tests)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/interest/interest.service.ts
git commit -m "feat(api): validate stop back-date; accept resume start date"
```

---

## Task 5: Controller — body schemas, pass-through, requester.id fix

**Files:**
- Modify: `apps/api/src/modules/interest/interest.controller.ts`

- [ ] **Step 1: Update the `/:stockId/stop` handler**

Find the stop handler body:

```ts
      await interestService.stopInterestCalculation(
        params.stockId,
        requester!.userId,
        body?.notes
      );
```

Replace with (fix `userId`→`id`, pass `stopDate`):

```ts
      await interestService.stopInterestCalculation(
        params.stockId,
        requester!.id,
        body?.notes,
        body?.stopDate ? new Date(body.stopDate) : undefined
      );
```

- [ ] **Step 2: Update the `/:stockId/stop` body schema**

Find:

```ts
      body: t.Optional(
        t.Object({
          notes: t.Optional(t.String()),
        })
      ),
```

Replace with:

```ts
      body: t.Optional(
        t.Object({
          notes: t.Optional(t.String()),
          stopDate: t.Optional(t.String()),
        })
      ),
```

- [ ] **Step 3: Update the `/:stockId/resume` handler**

Find:

```ts
      const result = await interestService.resumeInterestCalculation(
        params.stockId,
        {
          annualRate: body.annualRate,
          principalBase: body.principalBase as any,
          notes: body.notes,
        },
        requester!.userId
      );
```

Replace with (add `startDate`, fix `userId`→`id`):

```ts
      const result = await interestService.resumeInterestCalculation(
        params.stockId,
        {
          annualRate: body.annualRate,
          principalBase: body.principalBase as any,
          notes: body.notes,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
        },
        requester!.id
      );
```

- [ ] **Step 4: Update the `/:stockId/resume` body schema**

Find the resume route's body schema:

```ts
      body: t.Object({
        annualRate: t.Number({ minimum: 0, maximum: 100 }),
        principalBase: t.Optional(t.Union([t.Literal('BASE_COST_ONLY'), t.Literal('TOTAL_COST')])),
        notes: t.Optional(t.String()),
      }),
```

Replace with:

```ts
      body: t.Object({
        annualRate: t.Number({ minimum: 0, maximum: 100 }),
        principalBase: t.Optional(t.Union([t.Literal('BASE_COST_ONLY'), t.Literal('TOTAL_COST')])),
        notes: t.Optional(t.String()),
        startDate: t.Optional(t.String()),
      }),
```

- [ ] **Step 5: Verify typecheck**

Run: `cd apps/api && bunx tsc --noEmit`
Expected: no errors (exit 0)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/interest/interest.controller.ts
git commit -m "feat(api): expose stopDate/startDate on interest stop/resume routes; fix requester id"
```

---

## Task 6: Web service layer — stopDate + resume startDate

**Files:**
- Modify: `apps/web/src/services/interest.service.ts`

- [ ] **Step 1: Add `startDate` to `ResumeInterestData`**

Find:

```ts
export interface ResumeInterestData {
  annualRate: number;
  principalBase?: 'BASE_COST_ONLY' | 'TOTAL_COST';
  notes?: string;
}
```

Replace with:

```ts
export interface ResumeInterestData {
  annualRate: number;
  principalBase?: 'BASE_COST_ONLY' | 'TOTAL_COST';
  notes?: string;
  startDate?: string;
}
```

- [ ] **Step 2: Update `stopCalculation` to accept a date and return the response**

Find:

```ts
  /**
   * Stop interest calculation for a stock
   */
  async stopCalculation(stockId: string, notes?: string): Promise<void> {
    await api.post(`/api/interest/${stockId}/stop`, notes ? { notes } : undefined);
  }
```

Replace with (returns the envelope so callers can detect success; sends stopDate):

```ts
  /**
   * Stop interest calculation for a stock.
   * Returns the API envelope so callers can distinguish success from a void result.
   */
  async stopCalculation(
    stockId: string,
    notes?: string,
    stopDate?: string,
  ): Promise<{ success: boolean }> {
    const payload: { notes?: string; stopDate?: string } = {};
    if (notes) payload.notes = notes;
    if (stopDate) payload.stopDate = stopDate;
    return api.post<{ success: boolean }>(
      `/api/interest/${stockId}/stop`,
      Object.keys(payload).length ? payload : undefined,
    );
  }
```

(`resumeCalculation` already forwards the whole `data` object, so `startDate` flows through with no change.)

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/web && bunx tsc -b`
Expected: no errors (exit 0)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/services/interest.service.ts
git commit -m "feat(web): interest service supports stop date and resume start date"
```

---

## Task 7: StopInterestModal component

**Files:**
- Create: `apps/web/src/components/interest/StopInterestModal.tsx`

- [ ] **Step 1: Create the modal**

Create `apps/web/src/components/interest/StopInterestModal.tsx`:

```tsx
import { useState } from 'react';
import { X, PauseCircle, AlertCircle } from 'lucide-react';
import { DatePicker } from '../ui/date-picker';
import { isValidStopDate } from '../../pages/interest/interestActions';

interface StopInterestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { stopDate?: string; notes?: string }) => Promise<void>;
  /** ISO date/datetime of the active period start (lower bound); null if none */
  activePeriodStart: string | null;
  stockInfo: {
    vin: string;
    vehicleModel: { brand: string; model: string; variant: string | null; year: number };
  };
}

const todayIso = (): string => new Date().toISOString().split('T')[0];

export default function StopInterestModal({
  isOpen,
  onClose,
  onSubmit,
  activePeriodStart,
  stockInfo,
}: StopInterestModalProps) {
  const [stopDate, setStopDate] = useState<string>(todayIso());
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const today = todayIso();
  const minDate = activePeriodStart ? activePeriodStart.slice(0, 10) : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stopDate) {
      setError('กรุณาเลือกวันที่หยุดคิดดอกเบี้ย');
      return;
    }
    if (!isValidStopDate(stopDate, activePeriodStart, today)) {
      setError('วันที่หยุดต้องไม่เกินวันนี้ และไม่ก่อนวันเริ่มคิดดอกเบี้ยของงวดปัจจุบัน');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit({ stopDate, notes: notes || undefined });
      setNotes('');
      onClose();
    } catch {
      setError('ไม่สามารถหยุดคิดดอกเบี้ยได้ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-full">
                <PauseCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">หยุดคิดดอกเบี้ย</h3>
                <p className="text-sm text-gray-500">
                  {stockInfo.vehicleModel.brand} {stockInfo.vehicleModel.model} • {stockInfo.vin}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันที่หยุดคิดดอกเบี้ย <span className="text-red-500">*</span>
              </label>
              <DatePicker
                value={stopDate}
                onChange={setStopDate}
                inputClassName="w-full"
                minDate={minDate}
                maxDate={today}
              />
              <p className="mt-1 text-xs text-gray-500">
                เลือกย้อนหลังได้ถึงวันที่เริ่มคิดดอกเบี้ยของงวดปัจจุบัน (ไม่เกินวันนี้)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เหตุผลที่หยุดคิดดอกเบี้ย (ถ้ามี)"
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'กำลังบันทึก...' : 'ยืนยันหยุดคิดดอกเบี้ย'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/web && bunx tsc -b`
Expected: no errors (exit 0)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/interest/StopInterestModal.tsx
git commit -m "feat(web): StopInterestModal with back-date picker"
```

---

## Task 8: Wire the stop modal into InterestDetailPage

**Files:**
- Modify: `apps/web/src/pages/interest/InterestDetailPage.tsx`

- [ ] **Step 1: Import the modal**

Add below the existing `DebtPaymentModal` import:

```tsx
import StopInterestModal from '../../components/interest/StopInterestModal';
```

- [ ] **Step 2: Add modal open state**

Next to `const [showDebtPaymentModal, setShowDebtPaymentModal] = useState(false);` add:

```tsx
  const [showStopModal, setShowStopModal] = useState(false);
```

- [ ] **Step 3: Replace `handleStopCalculation` to take date + notes from the modal**

Find:

```tsx
  const handleStopCalculation = async () => {
    if (!window.confirm('คุณต้องการหยุดคิดดอกเบี้ยสำหรับรถคันนี้หรือไม่?')) {
      return;
    }

    setActionLoading(true);
    const result = await executeQuery(
      interestService.stopCalculation(stockId!, 'Stopped by user')
    );
    if (result) {
      await fetchDetail();
    }
    setActionLoading(false);
  };
```

Replace with:

```tsx
  const handleStopCalculation = async (data: { stopDate?: string; notes?: string }) => {
    setActionLoading(true);
    const result = await executeQuery(
      interestService.stopCalculation(stockId!, data.notes, data.stopDate)
    );
    if (result) {
      setShowStopModal(false);
      await Promise.all([fetchDetail(), fetchDebtData()]);
    }
    setActionLoading(false);
  };
```

- [ ] **Step 4: Open the modal from the stop button**

Find the stop button inside the `EDIT_AND_STOP` block:

```tsx
                <button
                  onClick={handleStopCalculation}
                  disabled={actionLoading}
                  className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <PauseCircle className="w-4 h-4 mr-2" />
                  หยุดคิดดอกเบี้ย
                </button>
```

Replace the `onClick` only:

```tsx
                <button
                  onClick={() => setShowStopModal(true)}
                  disabled={actionLoading}
                  className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <PauseCircle className="w-4 h-4 mr-2" />
                  หยุดคิดดอกเบี้ย
                </button>
```

- [ ] **Step 5: Render the modal (next to the DebtPaymentModal render at the end)**

Immediately before the existing `{debtSummary && debtSummary.hasFinanceProvider && ... <DebtPaymentModal ... />}` block, add:

```tsx
      <StopInterestModal
        isOpen={showStopModal}
        onClose={() => setShowStopModal(false)}
        onSubmit={handleStopCalculation}
        activePeriodStart={periods.find((p) => !p.endDate)?.startDate ?? null}
        stockInfo={{ vin: stock.vin, vehicleModel: stock.vehicleModel }}
      />
```

- [ ] **Step 6: Verify typecheck**

Run: `cd apps/web && bunx tsc -b`
Expected: no errors (exit 0)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/interest/InterestDetailPage.tsx
git commit -m "feat(web): stop interest via modal with back-date"
```

---

## Task 9: Resume start-date field in InterestEditPage

**Files:**
- Modify: `apps/web/src/pages/interest/InterestEditPage.tsx`

- [ ] **Step 1: Import the resume validator**

Add an import near the top:

```tsx
import { isValidResumeStartDate } from './interestActions';
```

- [ ] **Step 2: Send `startDate` on resume submit**

Find the resume branch in `handleSubmit`:

```tsx
    } else if (isResume) {
      promise = interestService.resumeCalculation(stockId!, {
        annualRate: rate,
        principalBase,
        notes: notes || undefined,
      });
    } else {
```

Replace with (add client validation + startDate):

```tsx
    } else if (isResume) {
      const lastStop = detail?.stock.interestStoppedAt ?? null;
      const todayStr = new Date().toISOString().split('T')[0];
      if (effectiveDate && !isValidResumeStartDate(effectiveDate, lastStop, todayStr)) {
        addToast('วันที่เริ่มคิดดอกเบี้ยใหม่ต้องไม่เกินวันนี้ และไม่ก่อนวันที่หยุดล่าสุด', 'error');
        setSubmitting(false);
        return;
      }
      promise = interestService.resumeCalculation(stockId!, {
        annualRate: rate,
        principalBase,
        notes: notes || undefined,
        startDate: effectiveDate || undefined,
      });
    } else {
```

- [ ] **Step 3: Show the date field in resume mode with bounds**

Find the date field block (currently hidden for resume):

```tsx
            {/* Effective Date (only for update, not resume) */}
            {!isResume && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  วันที่เริ่มใช้อัตราใหม่
                </label>
                <DatePicker
                  value={effectiveDate}
                  onChange={setEffectiveDate}
                  inputClassName="w-full"
                  clearable
                />
                <p className="mt-1 text-sm text-gray-500">
                  {isInitialize 
                    ? 'หากไม่ระบุ จะใช้วันที่เข้าสต็อกเป็นวันเริ่มต้น'
                    : 'หากไม่ระบุ จะใช้วันนี้เป็นวันเริ่มต้น'
                  }
                </p>
              </div>
            )}
```

Replace with (always render; resume gets its own label, help and min/max bounds):

```tsx
            {/* Effective / start date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                {isResume ? 'วันที่เริ่มคิดดอกเบี้ยใหม่' : 'วันที่เริ่มใช้อัตราใหม่'}
              </label>
              <DatePicker
                value={effectiveDate}
                onChange={setEffectiveDate}
                inputClassName="w-full"
                clearable={!isResume}
                minDate={isResume ? detail?.stock.interestStoppedAt?.slice(0, 10) : undefined}
                maxDate={isResume ? new Date().toISOString().split('T')[0] : undefined}
              />
              <p className="mt-1 text-sm text-gray-500">
                {isResume
                  ? 'เลือกวันที่ต้องการเริ่มคิดดอกเบี้ยใหม่ (ย้อนหลังได้ถึงวันที่หยุดล่าสุด ไม่เกินวันนี้)'
                  : isInitialize
                    ? 'หากไม่ระบุ จะใช้วันที่เข้าสต็อกเป็นวันเริ่มต้น'
                    : 'หากไม่ระบุ จะใช้วันนี้เป็นวันเริ่มต้น'}
              </p>
            </div>
```

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/web && bunx tsc -b`
Expected: no errors (exit 0)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/interest/InterestEditPage.tsx
git commit -m "feat(web): choose resume start date (back-date) in interest edit page"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: All tests pass**

Run: `cd apps/api && bun test` then `bun test apps/web/src/pages/interest/interestActions.test.ts`
Expected: all PASS

- [ ] **Step 2: Typecheck both apps**

Run: `cd apps/api && bunx tsc --noEmit` and `cd apps/web && bunx tsc -b`
Expected: no errors

- [ ] **Step 3: Biome on changed files**

Run:
```bash
cd /Users/marwinropmuang/Documents/NexmindIT/Car-Stock-monorepo
bunx biome check --write \
  apps/api/src/modules/interest/interest.dates.ts \
  apps/api/src/__tests__/interest-dates.test.ts \
  apps/web/src/pages/interest/interestActions.ts \
  apps/web/src/pages/interest/interestActions.test.ts \
  apps/web/src/components/interest/StopInterestModal.tsx \
  apps/web/src/components/ui/date-picker.tsx
```
Expected: "No fixes applied" on a second run (clean). Re-run any failed tests after formatting.

- [ ] **Step 4: Manual smoke (if a dev DB is reachable)**

Run `bun run dev`. As ADMIN/ACCOUNTANT:
1. Open a calculating stock → "หยุดคิดดอกเบี้ย" → modal → pick a back-date → ยืนยัน → detail refreshes, period closed at that date.
2. On the now-stopped stock → "เริ่มคิดดอกเบี้ยใหม่" → pick a start date ≥ stop date → บันทึก → new active period starts at that date.
Expected: no "คำขอไม่ถูกต้อง"; dates honored. (Skip if remote DB unreachable — pure-logic tests cover the rules.)

- [ ] **Step 5: Commit any formatting changes**

```bash
git add -A
git commit -m "chore: biome formatting for interest custom-date feature" || echo "nothing to commit"
```

---

## Self-Review notes

- **Spec coverage:** stop date (Tasks 4,5,7,8) · resume start date (Tasks 4,5,6,9) · validation client (Task 2) + server (Tasks 3,4) · DatePicker min/max (Task 1) · requester.id fix (Task 5) · pure-logic tests (Tasks 2,3). ✓
- **Out of scope (Phase 2):** future dates / scheduled-stop / reports clamp / `Math.abs` fix — intentionally excluded; all dates ≤ today.
- **Type consistency:** `isValidStopDate(stopDate, activePeriodStart, today)` / `isValidResumeStartDate(startDate, lastStopDate, today)` used identically in web + api; `stopCalculation(stockId, notes?, stopDate?)` matches the InterestDetailPage call; `ResumeInterestData.startDate` matches the resume submit and service input.
