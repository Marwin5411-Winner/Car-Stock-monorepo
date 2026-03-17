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
