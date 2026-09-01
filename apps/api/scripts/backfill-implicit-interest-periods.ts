/**
 * One-shot: stock stopped before the "close the implicit period" fix has no
 * InterestPeriod row at all, so its history is empty and every report reads 0.
 * Recreates the closed period from the stock's own rate and start date.
 *
 * Usage: cd apps/api && bun run scripts/backfill-implicit-interest-periods.ts [--apply]
 * Without --apply it only prints what it would create.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const apply = process.argv.includes('--apply');

function days(start: Date, end: Date): number {
  return Math.floor(Math.abs(end.getTime() - start.getTime()) / 86_400_000);
}

async function main() {
  const stocks = await db.stock.findMany({
    where: {
      deletedAt: null,
      stopInterestCalc: true,
      interestStoppedAt: { not: null },
      debtStatus: { not: 'PAID_OFF' },
      interestPeriods: { none: {} },
    },
    select: {
      id: true,
      vin: true,
      orderDate: true,
      arrivalDate: true,
      interestStoppedAt: true,
      interestRate: true,
      interestPrincipalBase: true,
      baseCost: true,
      transportCost: true,
      accessoryCost: true,
      otherCosts: true,
    },
  });

  let created = 0;

  for (const s of stocks) {
    const startDate = s.orderDate || s.arrivalDate;
    const endDate = s.interestStoppedAt;
    if (!startDate || !endDate || startDate > endDate) {
      console.log(`SKIP ${s.vin}: no usable start/stop date`);
      continue;
    }

    const principalAmount =
      s.interestPrincipalBase === 'BASE_COST_ONLY'
        ? Number(s.baseCost)
        : Number(s.baseCost) +
          Number(s.transportCost) +
          Number(s.accessoryCost) +
          Number(s.otherCosts);
    const annualRate = Number(s.interestRate) * 100;
    const daysCount = days(startDate, endDate);
    const calculatedInterest = ((principalAmount * annualRate) / 100 / 365) * daysCount;

    console.log(
      `${apply ? 'CREATE' : 'WOULD CREATE'} ${s.vin}: ${startDate.toISOString().slice(0, 10)} → ` +
        `${endDate.toISOString().slice(0, 10)} (${daysCount} วัน @ ${annualRate}%) = ${calculatedInterest.toFixed(2)}`
    );

    if (apply) {
      await db.interestPeriod.create({
        data: {
          stockId: s.id,
          startDate,
          endDate,
          annualRate,
          principalBase: s.interestPrincipalBase,
          principalAmount,
          calculatedInterest,
          daysCount,
          notes: '[Backfill] งวดดอกเบี้ยก่อนหยุดคิด',
        },
      });
      created++;
    }
  }

  console.log(`\n${stocks.length} คันที่หยุดคิดดอกเบี้ยแล้วแต่ไม่มีประวัติ, สร้างจริง ${created}`);
  if (!apply && stocks.length) console.log('รันซ้ำด้วย --apply เพื่อบันทึกจริง');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
