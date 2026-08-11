/**
 * One-shot: insert 10 DEMO stock units (idempotent by VIN).
 * Usage: cd apps/api && bun run scripts/seed-demo-stocks.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const COLORS = [
  'Pearl White',
  'Midnight Blue',
  'Titanium Gray',
  'Ruby Red',
  'Jet Black',
  'Silver Metallic',
  'Forest Green',
  'Sunset Orange',
  'Sky Blue',
  'Champagne Gold',
];

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
}

async function main() {
  const models = await db.vehicleModel.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      brand: true,
      model: true,
      variant: true,
      price: true,
      standardCost: true,
    },
  });

  if (models.length === 0) {
    throw new Error('No vehicle models found. Run db:seed first.');
  }

  let created = 0;
  let skipped = 0;

  for (let i = 1; i <= 10; i++) {
    const vin = `SEEDDEMO${pad(i, 8)}XX`;
    const existing = await db.stock.findUnique({ where: { vin } });
    if (existing) {
      skipped += 1;
      console.log(`  skip  ${existing.stockNumber ?? vin} (already exists)`);
      continue;
    }

    const vm = models[(i - 1) % models.length];
    const baseCost = Number(vm.standardCost);
    const price = Number(vm.price);
    const arrival = daysAgo(60 - i * 3);

    const stock = await db.stock.create({
      data: {
        stockNumber: `STK-DEMO-${pad(i)}`,
        vin,
        engineNumber: `ENG-DEMO-${pad(i, 4)}`,
        motorNumber1: i % 2 === 0 ? `MOT-DEMO-${pad(i, 4)}` : null,
        vehicleModelId: vm.id,
        exteriorColor: COLORS[(i - 1) % COLORS.length],
        interiorColor: i % 2 === 0 ? 'Black' : 'Beige',
        arrivalDate: arrival,
        orderDate: daysAgo(90 - i * 3),
        status: 'DEMO',
        parkingSlot: `DEMO-${pad(i)}`,
        receivedFrom: 'โรงงาน VBeyond',
        baseCost,
        transportCost: 12000 + (i % 4) * 1000,
        accessoryCost: i % 3 === 0 ? 15000 : 0,
        otherCosts: 0,
        interestRate: 0,
        interestPrincipalBase: 'BASE_COST_ONLY',
        accumulatedInterest: 0,
        stopInterestCalc: true,
        expectedSalePrice: price,
        debtAmount: 0,
        paidDebtAmount: 0,
        paidInterestAmount: 0,
        remainingDebt: 0,
        debtStatus: 'NO_DEBT',
        notes: `รถ Demo #${i} — ${vm.brand} ${vm.model}${vm.variant ? ` ${vm.variant}` : ''}`,
      },
    });

    created += 1;
    console.log(
      `  + ${stock.stockNumber}  ${vm.brand} ${vm.model}${vm.variant ? ` ${vm.variant}` : ''}  ${stock.exteriorColor}`
    );
  }

  console.log(`\n✅ DEMO stocks: created ${created}, skipped ${skipped}, target 10`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
