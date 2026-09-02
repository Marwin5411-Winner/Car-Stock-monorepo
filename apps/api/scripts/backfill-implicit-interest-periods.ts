/**
 * One-shot: stock that accrued from stock.interestRate without an InterestPeriod
 * row has empty history. Recreates the open (still calculating) or closed
 * (already stopped) period from the stock's own rate and start date.
 *
 * Usage: cd apps/api && bun run scripts/backfill-implicit-interest-periods.ts [--apply]
 * Without --apply it only prints what it would create.
 */
import { PrismaClient } from '@prisma/client';
import {
  buildImplicitDisplayPeriod,
  implicitPeriodWriteFields,
  shouldMaterializeImplicitPeriod,
} from '../src/modules/interest/interest.dates';

const db = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stocks = await db.stock.findMany({
    where: {
      deletedAt: null,
      interestRate: { gt: 0 },
      interestPeriods: { none: {} },
      OR: [
        { stopInterestCalc: false, debtStatus: { not: 'PAID_OFF' } },
        { stopInterestCalc: true, interestStoppedAt: { not: null } },
      ],
    },
    select: {
      id: true,
      vin: true,
      orderDate: true,
      arrivalDate: true,
      soldDate: true,
      interestStoppedAt: true,
      stopInterestCalc: true,
      debtStatus: true,
      interestRate: true,
      interestPrincipalBase: true,
      baseCost: true,
      transportCost: true,
      accessoryCost: true,
      otherCosts: true,
    },
  });

  let created = 0;
  let skipped = 0;

  for (const s of stocks) {
    const startDate = s.orderDate || s.arrivalDate;
    const annualRatePercent = Number(s.interestRate) * 100;
    if (
      !shouldMaterializeImplicitPeriod({
        periodCount: 0,
        annualRatePercent,
        startDate,
        debtStatus: s.debtStatus,
        stopInterestCalc: s.stopInterestCalc,
        interestStoppedAt: s.interestStoppedAt,
      })
    ) {
      console.log(`SKIP ${s.vin}: not eligible`);
      skipped++;
      continue;
    }

    const principalAmount =
      s.interestPrincipalBase === 'BASE_COST_ONLY'
        ? Number(s.baseCost)
        : Number(s.baseCost) +
          Number(s.transportCost) +
          Number(s.accessoryCost) +
          Number(s.otherCosts);

    const implicit = buildImplicitDisplayPeriod({
      startDate,
      annualRatePercent,
      principalAmount,
      debtStatus: s.debtStatus,
      stopInterestCalc: s.stopInterestCalc,
      interestStoppedAt: s.interestStoppedAt,
      soldDate: s.soldDate,
      today,
    });
    if (!implicit) {
      console.log(`SKIP ${s.vin}: no implicit period`);
      skipped++;
      continue;
    }

    const write = implicitPeriodWriteFields(implicit);
    const endLabel = write.endDate ? write.endDate.toISOString().slice(0, 10) : 'ปัจจุบัน';
    const displayInterest = write.endDate ? write.calculatedInterest : implicit.calculatedInterest;

    console.log(
      `${apply ? 'CREATE' : 'WOULD CREATE'} ${s.vin}: ${write.startDate.toISOString().slice(0, 10)} → ` +
        `${endLabel} (${implicit.daysCount} วัน @ ${annualRatePercent}%) = ${displayInterest.toFixed(2)}`
    );

    if (apply) {
      await db.interestPeriod.create({
        data: {
          stockId: s.id,
          startDate: write.startDate,
          endDate: write.endDate,
          annualRate: annualRatePercent,
          principalBase: s.interestPrincipalBase,
          principalAmount,
          calculatedInterest: write.calculatedInterest,
          daysCount: write.daysCount,
          notes: write.endDate ? '[Backfill] งวดดอกเบี้ยก่อนหยุดคิด' : '[Backfill] เริ่มคิดดอกเบี้ย',
        },
      });
      created++;
    }
  }

  console.log(`\n${stocks.length} คันที่ไม่มีประวัติ, สร้างจริง ${created}, ข้าม ${skipped}`);
  if (!apply && stocks.length) console.log('รันซ้ำด้วย --apply เพื่อบันทึกจริง');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
