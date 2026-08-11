/**
 * One-shot: for every sale with a linked stock, set vehicleModelId = stock.vehicleModelId.
 * Usage: cd apps/api && bun run scripts/repair-sale-vehicle-model.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const sales = await db.sale.findMany({
    where: { stockId: { not: null } },
    select: {
      id: true,
      saleNumber: true,
      vehicleModelId: true,
      stock: { select: { vehicleModelId: true } },
    },
  });

  let fixed = 0;
  let ok = 0;

  for (const s of sales) {
    const stockVm = s.stock?.vehicleModelId;
    if (!stockVm) {
      continue;
    }
    if (s.vehicleModelId === stockVm) {
      ok += 1;
      continue;
    }
    await db.sale.update({
      where: { id: s.id },
      data: { vehicleModelId: stockVm },
    });
    fixed += 1;
    console.log(`  fixed ${s.saleNumber}: ${s.vehicleModelId} → ${stockVm}`);
  }

  console.log(`\n✅ repair done: fixed ${fixed}, already ok ${ok}, scanned ${sales.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
