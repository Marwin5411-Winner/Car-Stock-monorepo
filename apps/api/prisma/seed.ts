import { PrismaClient, type Role } from '@prisma/client';

const db = new PrismaClient();
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);

  const admin = await db.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@vbeyond.co.th',
      password: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      phone: '044-272-888',
      role: 'ADMIN' as Role,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Admin user created:', admin.username);

  // Create sample users for each role
  const roles: { role: Role; username: string; firstName: string; lastName: string }[] = [
    { role: 'SALES_MANAGER', username: 'manager1', firstName: 'สมชาย', lastName: 'จัดการดี' },
    { role: 'SALES_STAFF', username: 'sales1', firstName: 'สมหญิง', lastName: 'ขายเก่ง' },
    { role: 'STOCK_STAFF', username: 'stock1', firstName: 'สมศักดิ์', lastName: 'ดูแลสต็อก' },
    { role: 'ACCOUNTANT', username: 'account1', firstName: 'สมพร', lastName: 'บัญชีดี' },
  ];

  const defaultPassword = await bcrypt.hash('password123', 10);

  for (const userData of roles) {
    const user = await db.user.upsert({
      where: { username: userData.username },
      update: {},
      create: {
        username: userData.username,
        email: `${userData.username}@vbeyond.co.th`,
        password: defaultPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: '044-272-888',
        role: userData.role,
        status: 'ACTIVE',
      },
    });
    console.log(`✅ ${userData.role} user created:`, user.username);
  }

  // Create sample vehicle models (VBeyond EV models)
  const vehicleModels = [
    {
      brand: 'VBeyond',
      model: 'VB-E1',
      variant: 'Standard Range',
      year: 2025,
      type: 'EV' as const,
      primaryColor: 'Pearl White',
      secondaryColor: 'Black',
      mainOptions: 'LED Headlights, 10" Touchscreen, Keyless Entry',
      engineSpecs: 'Electric Motor 150kW, Battery 60kWh, Range 400km',
      dimensions: '4,500 x 1,850 x 1,650 mm',
      price: 1299000,
      standardCost: 950000,
      targetMargin: 15,
    },
    {
      brand: 'VBeyond',
      model: 'VB-E1',
      variant: 'Long Range',
      year: 2025,
      type: 'EV' as const,
      primaryColor: 'Midnight Blue',
      secondaryColor: 'Gray',
      mainOptions: 'LED Headlights, 12" Touchscreen, Premium Sound, Keyless Entry',
      engineSpecs: 'Electric Motor 180kW, Battery 80kWh, Range 550km',
      dimensions: '4,500 x 1,850 x 1,650 mm',
      price: 1599000,
      standardCost: 1150000,
      targetMargin: 15,
    },
    {
      brand: 'VBeyond',
      model: 'VB-SUV',
      variant: 'Premium',
      year: 2025,
      type: 'SUV' as const,
      primaryColor: 'Titanium Gray',
      secondaryColor: 'Black',
      mainOptions: '7 Seats, Panoramic Sunroof, 360 Camera, Premium Sound',
      engineSpecs: 'Electric Motor 200kW, Battery 100kWh, Range 500km',
      dimensions: '4,900 x 1,950 x 1,750 mm',
      price: 2199000,
      standardCost: 1600000,
      targetMargin: 12,
    },
  ];

  for (const model of vehicleModels) {
    // Use brand+model+variant+year as unique identifier for upsert
    const existing = await db.vehicleModel.findFirst({
      where: {
        brand: model.brand,
        model: model.model,
        variant: model.variant,
        year: model.year,
      },
    });

    let created;
    if (existing) {
      created = existing;
    } else {
      // Let Prisma auto-generate cuid for new records
      created = await db.vehicleModel.create({
        data: {
          brand: model.brand,
          model: model.model,
          variant: model.variant,
          year: model.year,
          type: model.type,
          primaryColor: model.primaryColor,
          secondaryColor: model.secondaryColor,
          mainOptions: model.mainOptions,
          engineSpecs: model.engineSpecs,
          dimensions: model.dimensions,
          price: model.price,
          standardCost: model.standardCost,
          targetMargin: model.targetMargin,
        },
      });
    }
    console.log(`✅ Vehicle model created: ${created.brand} ${created.model} ${created.variant}`);
  }

  // Initialize number sequences
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const sequences = [
    { prefix: 'CUST', year: currentYear, month: null },
    { prefix: 'SL', year: currentYear, month: null },
    { prefix: 'QTN', year: currentYear, month: currentMonth },
    { prefix: 'RCPT', year: currentYear, month: currentMonth },
  ];

  for (const seq of sequences) {
    await db.numberSequence.upsert({
      where: {
        prefix_year_month: {
          prefix: seq.prefix,
          year: seq.year,
          month: seq.month ?? 0,
        },
      },
      update: {},
      create: {
        prefix: seq.prefix,
        year: seq.year,
        month: seq.month,
        lastNumber: 0,
      },
    });
  }
  console.log('✅ Number sequences initialized');

  // -------------------------------------------------------------------------
  // Campaign demo data — full path for report testing
  // (campaign + models + formulas + customer + stocks + sales with campaignId)
  // -------------------------------------------------------------------------
  const models = await db.vehicleModel.findMany({
    where: {
      OR: [
        { brand: 'VBeyond', model: 'VB-E1', variant: 'Standard Range', year: 2025 },
        { brand: 'VBeyond', model: 'VB-E1', variant: 'Long Range', year: 2025 },
      ],
    },
  });
  const modelStd = models.find((m) => m.variant === 'Standard Range');
  const modelLr = models.find((m) => m.variant === 'Long Range');

  if (!modelStd || !modelLr) {
    console.warn('⚠️  Skip campaign demo: VB-E1 Standard/Long Range models missing');
  } else {
    const customer =
      (await db.customer.findFirst({ where: { code: 'CUST-DEMO-CAMP' } })) ??
      (await db.customer.create({
        data: {
          code: 'CUST-DEMO-CAMP',
          type: 'INDIVIDUAL',
          salesType: 'NORMAL_SALES',
          name: 'ลูกค้าทดสอบแคมเปญ',
          houseNumber: '99',
          street: 'ถนนทดสอบ',
          subdistrict: 'ในเมือง',
          district: 'เมือง',
          province: 'นครราชสีมา',
          postalCode: '30000',
          phone: '0812345678',
        },
      }));
    console.log('✅ Demo customer:', customer.code);

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);

    // --- A) FULL report: ACTIVE + 2 models + formulas on both + 2 tagged sales
    let fullCampaign = await db.campaign.findFirst({
      where: { name: 'DEMO รายงานแคมเปญครบ' },
    });
    if (!fullCampaign) {
      fullCampaign = await db.campaign.create({
        data: {
          name: 'DEMO รายงานแคมเปญครบ',
          description: 'Seed: รุ่น + สูตร + ใบขายผูกครบ — ใช้เทส /campaigns/:id/report',
          status: 'ACTIVE',
          startDate,
          endDate,
          branch: 'โคราช',
          notes: 'seed demo full report',
          createdById: admin.id,
          vehicleModels: {
            create: [{ vehicleModelId: modelStd.id }, { vehicleModelId: modelLr.id }],
          },
        },
      });
    } else {
      // Ensure models are linked (idempotent)
      for (const vmId of [modelStd.id, modelLr.id]) {
        await db.campaignVehicleModel.upsert({
          where: {
            campaignId_vehicleModelId: {
              campaignId: fullCampaign.id,
              vehicleModelId: vmId,
            },
          },
          update: {},
          create: { campaignId: fullCampaign.id, vehicleModelId: vmId },
        });
      }
    }
    console.log('✅ Full campaign:', fullCampaign.id);

    const formulaSpecs: Array<{
      vehicleModelId: string;
      name: string;
      operator: 'PERCENT' | 'FIXED';
      value: number;
      priceTarget: 'SELLING_PRICE' | 'COST_PRICE';
      sortOrder: number;
    }> = [
      {
        vehicleModelId: modelStd.id,
        name: 'Marketing 1%',
        operator: 'PERCENT',
        value: 1,
        priceTarget: 'SELLING_PRICE',
        sortOrder: 1,
      },
      {
        vehicleModelId: modelStd.id,
        name: 'เปิดบูธ',
        operator: 'FIXED',
        value: 5000,
        priceTarget: 'SELLING_PRICE',
        sortOrder: 2,
      },
      {
        vehicleModelId: modelLr.id,
        name: 'Marketing 1%',
        operator: 'PERCENT',
        value: 1,
        priceTarget: 'SELLING_PRICE',
        sortOrder: 1,
      },
      {
        vehicleModelId: modelLr.id,
        name: 'STOCK LEVEL 0.5%',
        operator: 'PERCENT',
        value: 0.5,
        priceTarget: 'COST_PRICE',
        sortOrder: 2,
      },
    ];

    for (const f of formulaSpecs) {
      const exists = await db.campaignModelFormula.findFirst({
        where: {
          campaignId: fullCampaign.id,
          vehicleModelId: f.vehicleModelId,
          name: f.name,
        },
      });
      if (!exists) {
        await db.campaignModelFormula.create({
          data: {
            campaignId: fullCampaign.id,
            vehicleModelId: f.vehicleModelId,
            name: f.name,
            operator: f.operator,
            value: f.value,
            priceTarget: f.priceTarget,
            sortOrder: f.sortOrder,
          },
        });
      }
    }
    console.log('✅ Full campaign formulas seeded');

    // Stocks + sales for each model
    const stockDefs = [
      {
        vin: 'SEEDCAMPSTD0000001',
        engineNumber: 'ENG-SEED-STD-01',
        vehicleModelId: modelStd.id,
        baseCost: 950000,
        saleNumber: 'SL-SEED-CAMP-001',
        totalAmount: 1299000,
        financeCommission: 3000,
      },
      {
        vin: 'SEEDCAMPLR00000001',
        engineNumber: 'ENG-SEED-LR-01',
        vehicleModelId: modelLr.id,
        baseCost: 1150000,
        saleNumber: 'SL-SEED-CAMP-002',
        totalAmount: 1599000,
        financeCommission: 4500,
      },
    ];

    for (const def of stockDefs) {
      let stock = await db.stock.findUnique({ where: { vin: def.vin } });
      if (!stock) {
        stock = await db.stock.create({
          data: {
            stockNumber: `STK-SEED-${def.vin}`,
            vin: def.vin,
            engineNumber: def.engineNumber,
            vehicleModelId: def.vehicleModelId,
            exteriorColor: 'Pearl White',
            interiorColor: 'Black',
            status: 'SOLD',
            baseCost: def.baseCost,
            actualSalePrice: def.totalAmount,
            soldDate: now,
            arrivalDate: startDate,
          },
        });
      } else if (stock.status !== 'SOLD') {
        stock = await db.stock.update({
          where: { id: stock.id },
          data: {
            status: 'SOLD',
            actualSalePrice: def.totalAmount,
            soldDate: now,
          },
        });
      }

      const existingSale = await db.sale.findUnique({ where: { saleNumber: def.saleNumber } });
      if (!existingSale) {
        // stockId is unique on Sale — free any prior link to this stock
        const linked = await db.sale.findFirst({ where: { stockId: stock.id } });
        if (linked && linked.saleNumber !== def.saleNumber) {
          console.warn(`⚠️  Stock ${def.vin} already linked to ${linked.saleNumber}, skip sale create`);
          continue;
        }
        await db.sale.create({
          data: {
            saleNumber: def.saleNumber,
            type: 'DIRECT_SALE',
            status: 'COMPLETED',
            customerId: customer.id,
            stockId: stock.id,
            vehicleModelId: def.vehicleModelId,
            totalAmount: def.totalAmount,
            depositAmount: 0,
            paidAmount: def.totalAmount,
            remainingAmount: 0,
            completedDate: now,
            campaignId: fullCampaign.id,
            campaignSubsidySnapshot: 0,
            paymentMode: 'FINANCE',
            financeProvider: 'ธนาคารทดสอบ',
            financeCommission: def.financeCommission,
            createdById: admin.id,
          },
        });
        console.log(`✅ Demo sale ${def.saleNumber} → campaign ${fullCampaign.id}`);
      } else if (!existingSale.campaignId) {
        await db.sale.update({
          where: { id: existingSale.id },
          data: { campaignId: fullCampaign.id },
        });
        console.log(`✅ Linked existing sale ${def.saleNumber} to full campaign`);
      }
    }

    // --- B) INCOMPLETE: models + formulas, NO sales (report shows formula cols, empty rows)
    let emptySalesCampaign = await db.campaign.findFirst({
      where: { name: 'DEMO แคมเปญมีสูตรไม่มีขาย' },
    });
    if (!emptySalesCampaign) {
      emptySalesCampaign = await db.campaign.create({
        data: {
          name: 'DEMO แคมเปญมีสูตรไม่มีขาย',
          description: 'Seed: มีสูตรแต่ไม่มีใบขาย — รายงานจะว่างแถวรถ',
          status: 'ACTIVE',
          startDate,
          endDate,
          branch: 'โคราช',
          createdById: admin.id,
          vehicleModels: { create: [{ vehicleModelId: modelStd.id }] },
        },
      });
      await db.campaignModelFormula.create({
        data: {
          campaignId: emptySalesCampaign.id,
          vehicleModelId: modelStd.id,
          name: 'Marketing 1%',
          operator: 'PERCENT',
          value: 1,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 1,
        },
      });
      console.log('✅ Empty-sales campaign:', emptySalesCampaign.id);
    }

    // --- C) INCOMPLETE: models + sale tagged, NO formulas (report shows car rows, no formula cols)
    let noFormulaCampaign = await db.campaign.findFirst({
      where: { name: 'DEMO แคมเปญมีขายไม่มีสูตร' },
    });
    if (!noFormulaCampaign) {
      noFormulaCampaign = await db.campaign.create({
        data: {
          name: 'DEMO แคมเปญมีขายไม่มีสูตร',
          description: 'Seed: มีใบขายแต่ไม่มีสูตร — รายงานไม่มีคอลัมน์สูตร',
          status: 'ACTIVE',
          startDate,
          endDate,
          branch: 'โคราช',
          createdById: admin.id,
          vehicleModels: { create: [{ vehicleModelId: modelLr.id }] },
        },
      });

      const vin = 'SEEDCAMPNOFORMULA01';
      let stock = await db.stock.findUnique({ where: { vin } });
      if (!stock) {
        stock = await db.stock.create({
          data: {
            stockNumber: 'STK-NOFORM',
            vin,
            engineNumber: 'ENG-SEED-NOFORM-01',
            vehicleModelId: modelLr.id,
            exteriorColor: 'Midnight Blue',
            status: 'SOLD',
            baseCost: 1150000,
            actualSalePrice: 1599000,
            soldDate: now,
            arrivalDate: startDate,
          },
        });
      }
      const saleNo = 'SL-SEED-CAMP-NOFORM';
      if (!(await db.sale.findUnique({ where: { saleNumber: saleNo } }))) {
        const linked = await db.sale.findFirst({ where: { stockId: stock.id } });
        if (!linked) {
          await db.sale.create({
            data: {
              saleNumber: saleNo,
              type: 'DIRECT_SALE',
              status: 'COMPLETED',
              customerId: customer.id,
              stockId: stock.id,
              vehicleModelId: modelLr.id,
              totalAmount: 1599000,
              depositAmount: 0,
              paidAmount: 1599000,
              remainingAmount: 0,
              completedDate: now,
              campaignId: noFormulaCampaign.id,
              paymentMode: 'CASH',
              createdById: admin.id,
            },
          });
        }
      }
      console.log('✅ No-formula campaign:', noFormulaCampaign.id);
    }

    console.log('');
    console.log('📌 Campaign report demos:');
    console.log(`   FULL     → id=${fullCampaign.id}  name="DEMO รายงานแคมเปญครบ"`);
    if (emptySalesCampaign) {
      console.log(`   NO SALES → id=${emptySalesCampaign.id}`);
    }
    if (noFormulaCampaign) {
      console.log(`   NO FORM  → id=${noFormulaCampaign.id}`);
    }
  }

  console.log('');
  console.log('🎉 Database seed completed!');
  console.log('');
  console.log('📋 Test Credentials:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Admin:         admin / admin123');
  console.log('Sales Manager: manager1 / password123');
  console.log('Sales Staff:   sales1 / password123');
  console.log('Stock Staff:   stock1 / password123');
  console.log('Accountant:    account1 / password123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
