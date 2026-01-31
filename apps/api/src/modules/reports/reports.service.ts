import { db } from '../../lib/db';
import { StockStatus, SaleStatus, PaymentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  STOCK_STATUS_LABELS,
  SALE_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_MODE_LABELS,
} from '@car-stock/shared/constants';

// Helper functions
const toNumber = (val: Decimal | number | null | undefined): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val);
};

const formatDateKey = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const getMonthKey = (date: Date): string => {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${months[date.getMonth()]} ${date.getFullYear() + 543}`;
};

const calculateDays = (startDate: Date, endDate: Date): number => {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const calculateInterest = (principal: number, annualRate: number, days: number): number => {
  const dailyRate = annualRate / 100 / 365;
  return principal * dailyRate * days;
};

// ============================================
// Daily Payment Report Service
// ============================================

interface DailyPaymentParams {
  startDate?: Date;
  endDate?: Date;
}

export async function getDailyPaymentReport(params: DailyPaymentParams) {
  const { startDate, endDate } = params;
  
  const where: Record<string, unknown> = {
    status: 'ACTIVE' as PaymentStatus,
  };

  if (startDate && endDate) {
    where.paymentDate = {
      gte: startDate,
      lte: endDate,
    };
  }

  const payments = await db.payment.findMany({
    where,
    include: {
      customer: {
        select: { id: true, name: true, code: true },
      },
      sale: {
        select: { id: true, saleNumber: true },
      },
    },
    orderBy: { paymentDate: 'desc' },
  });

  // Transform data
  const paymentItems = payments.map((p) => ({
    id: p.id,
    receiptNumber: p.receiptNumber,
    paymentDate: p.paymentDate.toISOString(),
    customerName: p.customer.name,
    customerCode: p.customer.code,
    paymentType: p.paymentType,
    paymentTypeLabel: PAYMENT_TYPE_LABELS[p.paymentType as keyof typeof PAYMENT_TYPE_LABELS] || p.paymentType,
    paymentMethod: p.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[p.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || p.paymentMethod,
    amount: toNumber(p.amount),
    saleNumber: p.sale?.saleNumber,
    notes: p.notes,
  }));

  // Calculate summary
  const totalAmount = paymentItems.reduce((sum, p) => sum + p.amount, 0);
  const totalCount = paymentItems.length;

  // Group by method
  const methodGroups: Record<string, { count: number; amount: number }> = {};
  paymentItems.forEach((p) => {
    if (!methodGroups[p.paymentMethod]) {
      methodGroups[p.paymentMethod] = { count: 0, amount: 0 };
    }
    methodGroups[p.paymentMethod].count += 1;
    methodGroups[p.paymentMethod].amount += p.amount;
  });

  const byMethod = Object.entries(methodGroups).map(([method, data]) => ({
    method,
    label: PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] || method,
    count: data.count,
    amount: data.amount,
  }));

  // Group by type
  const typeGroups: Record<string, { count: number; amount: number }> = {};
  paymentItems.forEach((p) => {
    if (!typeGroups[p.paymentType]) {
      typeGroups[p.paymentType] = { count: 0, amount: 0 };
    }
    typeGroups[p.paymentType].count += 1;
    typeGroups[p.paymentType].amount += p.amount;
  });

  const byType = Object.entries(typeGroups).map(([type, data]) => ({
    type,
    label: PAYMENT_TYPE_LABELS[type as keyof typeof PAYMENT_TYPE_LABELS] || type,
    count: data.count,
    amount: data.amount,
  }));

  // Chart data - daily totals
  const dailyTotals: Record<string, { amount: number; count: number }> = {};
  paymentItems.forEach((p) => {
    const dateKey = p.paymentDate.split('T')[0];
    if (!dailyTotals[dateKey]) {
      dailyTotals[dateKey] = { amount: 0, count: 0 };
    }
    dailyTotals[dateKey].amount += p.amount;
    dailyTotals[dateKey].count += 1;
  });

  const chartData = Object.entries(dailyTotals)
    .map(([date, data]) => ({
      date,
      amount: data.amount,
      count: data.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    payments: paymentItems,
    summary: {
      totalAmount,
      totalCount,
      byMethod,
      byType,
    },
    chartData,
  };
}

// ============================================
// Stock Report Service
// ============================================

interface StockReportParams {
  startDate?: Date;
  endDate?: Date;
  status?: StockStatus;
}

export async function getStockReport(params: StockReportParams) {
  const { status } = params;

  const where: Record<string, unknown> = {};
  if (status) {
    where.status = status;
  }

  const stocks = await db.stock.findMany({
    where,
    include: {
      vehicleModel: {
        select: {
          brand: true,
          model: true,
          variant: true,
          year: true,
        },
      },
      sale: {
        select: {
          customer: {
            select: {
              name: true,
            },
          },
          reservedDate: true,
          createdAt: true,
        },
      },
    },
    orderBy: { arrivalDate: 'desc' },
  });

  const today = new Date();

  const stockItems = stocks.map((s) => {
    const daysInStock = calculateDays(s.arrivalDate, s.soldDate || today);
    const baseCost = toNumber(s.baseCost);
    const transportCost = toNumber(s.transportCost);
    const accessoryCost = toNumber(s.accessoryCost);
    const otherCosts = toNumber(s.otherCosts);
    const accumulatedInterest = toNumber(s.accumulatedInterest);
    const totalCost = baseCost + transportCost + accessoryCost + otherCosts + accumulatedInterest;

    return {
      id: s.id,
      vin: s.vin,
      engineNumber: s.engineNumber || '-',
      brand: s.vehicleModel.brand,
      model: s.vehicleModel.model,
      variant: s.vehicleModel.variant,
      year: s.vehicleModel.year,
      vehicleModelName: `${s.vehicleModel.brand} ${s.vehicleModel.model} ${s.vehicleModel.variant || ''}`,
      exteriorColor: s.exteriorColor,
      interiorColor: s.interiorColor,
      status: s.status,
      statusLabel: STOCK_STATUS_LABELS[s.status as keyof typeof STOCK_STATUS_LABELS] || s.status,
      arrivalDate: s.arrivalDate.toISOString(),
      orderDate: s.orderDate?.toISOString(),
      daysInStock,
      parkingSlot: s.parkingSlot || '-',
      
      // Costs
      baseCost,
      transportCost,
      accessoryCost,
      otherCosts,
      accumulatedInterest,
      totalCost,
      
      // Reservation info
      reservedBy: s.sale?.customer?.name || '-',
      reservedDate: s.sale?.reservedDate ? s.sale.reservedDate.toISOString() : undefined,
    };
  });

  // Summary
  const totalCount = stockItems.length;
  const availableCount = stockItems.filter((s) => s.status === 'AVAILABLE').length;
  const reservedCount = stockItems.filter((s) => s.status === 'RESERVED').length;
  const preparingCount = stockItems.filter((s) => s.status === 'PREPARING').length;
  const soldCount = stockItems.filter((s) => s.status === 'SOLD').length;
  const totalValue = stockItems.reduce((sum, s) => sum + s.totalCost, 0);

  // By status
  const byStatus = [
    { status: 'AVAILABLE', label: 'พร้อมขาย', count: availableCount, percentage: totalCount > 0 ? (availableCount / totalCount) * 100 : 0 },
    { status: 'RESERVED', label: 'จองแล้ว', count: reservedCount, percentage: totalCount > 0 ? (reservedCount / totalCount) * 100 : 0 },
    { status: 'PREPARING', label: 'เตรียมส่งมอบ', count: preparingCount, percentage: totalCount > 0 ? (preparingCount / totalCount) * 100 : 0 },
    { status: 'SOLD', label: 'ขายแล้ว', count: soldCount, percentage: totalCount > 0 ? (soldCount / totalCount) * 100 : 0 },
  ];

  // By brand
  const brandGroups: Record<string, number> = {};
  stockItems.forEach((s) => {
    brandGroups[s.brand] = (brandGroups[s.brand] || 0) + 1;
  });

  const byBrand = Object.entries(brandGroups)
    .map(([brand, count]) => ({
      brand,
      count,
      percentage: totalCount > 0 ? (count / totalCount) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Chart data
  const chartData = {
    byStatus: byStatus.map((s) => ({ status: s.status, label: s.label, count: s.count })),
    byBrand: byBrand.slice(0, 10), // Top 10 brands
    byMonth: [], // TODO: Implement monthly trend
  };

  return {
    stocks: stockItems,
    summary: {
      totalCount,
      availableCount,
      reservedCount,
      preparingCount,
      soldCount,
      totalValue,
      byStatus,
      byBrand,
    },
    chartData,
  };
}

// ============================================
// Profit & Loss Report Service
// ============================================

interface ProfitLossParams {
  startDate?: Date;
  endDate?: Date;
}

export async function getProfitLossReport(params: ProfitLossParams) {
  const { startDate, endDate } = params;

  const where: Record<string, unknown> = {
    status: { in: ['DELIVERED', 'COMPLETED'] as SaleStatus[] },
  };

  if (startDate && endDate) {
    where.completedDate = {
      gte: startDate,
      lte: endDate,
    };
  }

  const sales = await db.sale.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      stock: {
        include: {
          vehicleModel: { select: { brand: true, model: true, variant: true, year: true } },
          interestPeriods: true,
        },
      },
      vehicleModel: { select: { brand: true, model: true, variant: true, year: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { completedDate: 'desc' },
  });

  const today = new Date();

  const saleItems = sales.map((sale) => {
    const stock = sale.stock;
    const vehicleModel = stock?.vehicleModel || sale.vehicleModel;

    const sellingPrice = toNumber(sale.totalAmount);
    const baseCost = toNumber(stock?.baseCost) || 0;
    const transportCost = toNumber(stock?.transportCost) || 0;
    const accessoryCost = toNumber(stock?.accessoryCost) || 0;
    const otherCosts = toNumber(stock?.otherCosts) || 0;
    const totalCost = baseCost + transportCost + accessoryCost + otherCosts;

    // Calculate accumulated interest
    let accumulatedInterest = 0;
    if (stock) {
      stock.interestPeriods.forEach((period) => {
        if (period.endDate) {
          accumulatedInterest += toNumber(period.calculatedInterest);
        } else {
          const endDate = stock.soldDate || today;
          const days = calculateDays(period.startDate, endDate);
          accumulatedInterest += calculateInterest(
            toNumber(period.principalAmount),
            toNumber(period.annualRate),
            days
          );
        }
      });

      // If no periods, use default rate
      if (stock.interestPeriods.length === 0 && !stock.stopInterestCalc) {
        const interestStartDate = stock.orderDate || stock.arrivalDate;
        const endDate = stock.soldDate || today;
        const days = calculateDays(interestStartDate, endDate);
        const rate = toNumber(stock.interestRate) * 100;
        const principal = stock.interestPrincipalBase === 'BASE_COST_ONLY' ? baseCost : totalCost;
        accumulatedInterest = calculateInterest(principal, rate, days);
      }
    }

    const totalCostWithInterest = totalCost + accumulatedInterest;
    const grossProfit = sellingPrice - totalCost;
    const netProfit = sellingPrice - totalCostWithInterest;
    const profitMargin = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;

    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      saleDate: sale.createdAt.toISOString(),
      completedDate: sale.completedDate?.toISOString() || sale.createdAt.toISOString(),
      customerName: sale.customer.name,
      vehicleInfo: vehicleModel ? `${vehicleModel.brand} ${vehicleModel.model} ${vehicleModel.variant || ''} ${vehicleModel.year}` : 'N/A',
      vin: stock?.vin || 'N/A',
      sellingPrice,
      baseCost,
      transportCost,
      accessoryCost,
      otherCosts,
      totalCost,
      interestCost: Math.round(accumulatedInterest * 100) / 100,
      accumulatedInterest: Math.round(accumulatedInterest * 100) / 100,
      totalCostWithInterest: Math.round(totalCostWithInterest * 100) / 100,
      grossProfit,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      salesperson: `${sale.createdBy.firstName} ${sale.createdBy.lastName}`,
    };
  });

  // Summary
  const totalRevenue = saleItems.reduce((sum, s) => sum + s.sellingPrice, 0);
  const totalCost = saleItems.reduce((sum, s) => sum + s.totalCost, 0);
  const totalInterest = saleItems.reduce((sum, s) => sum + s.accumulatedInterest, 0);
  const totalCostWithInterest = saleItems.reduce((sum, s) => sum + s.totalCostWithInterest, 0);
  const grossProfit = saleItems.reduce((sum, s) => sum + s.grossProfit, 0);
  const netProfit = saleItems.reduce((sum, s) => sum + s.netProfit, 0);
  const avgProfitMargin = saleItems.length > 0 
    ? saleItems.reduce((sum, s) => sum + s.profitMargin, 0) / saleItems.length 
    : 0;
  const saleCount = saleItems.length;
  const profitableSales = saleItems.filter((s) => s.netProfit > 0).length;
  const lossSales = saleItems.filter((s) => s.netProfit < 0).length;

  // Chart data - monthly
  const monthlyGroups: Record<string, { revenue: number; cost: number; profit: number }> = {};
  saleItems.forEach((s) => {
    const date = new Date(s.completedDate);
    const monthKey = getMonthKey(date);
    if (!monthlyGroups[monthKey]) {
      monthlyGroups[monthKey] = { revenue: 0, cost: 0, profit: 0 };
    }
    monthlyGroups[monthKey].revenue += s.sellingPrice;
    monthlyGroups[monthKey].cost += s.totalCostWithInterest;
    monthlyGroups[monthKey].profit += s.netProfit;
  });

  const monthly = Object.entries(monthlyGroups).map(([month, data]) => ({
    month,
    revenue: data.revenue,
    cost: data.cost,
    profit: data.profit,
  }));

  // By salesperson
  const salespersonGroups: Record<string, { profit: number; count: number }> = {};
  saleItems.forEach((s) => {
    if (!salespersonGroups[s.salesperson]) {
      salespersonGroups[s.salesperson] = { profit: 0, count: 0 };
    }
    salespersonGroups[s.salesperson].profit += s.netProfit;
    salespersonGroups[s.salesperson].count += 1;
  });

  const bySalesperson = Object.entries(salespersonGroups)
    .map(([name, data]) => ({
      name,
      profit: Math.round(data.profit * 100) / 100,
      count: data.count,
    }))
    .sort((a, b) => b.profit - a.profit);

  // Calculate average profit per vehicle
  const averageProfitPerVehicle = saleCount > 0 ? netProfit / saleCount : 0;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    items: saleItems,
    sales: saleItems,
    summary: {
      totalRevenue,
      totalCost,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalInterestCost: Math.round(totalInterest * 100) / 100,
      totalCostWithInterest: Math.round(totalCostWithInterest * 100) / 100,
      grossProfit,
      netProfit: Math.round(netProfit * 100) / 100,
      avgProfitMargin: Math.round(avgProfitMargin * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      averageProfitPerVehicle: Math.round(averageProfitPerVehicle * 100) / 100,
      totalSales: saleCount,
      saleCount,
      profitableSales,
      lossSales,
    },
    chartData: {
      monthlyProfit: monthly.map(m => ({ month: m.month, revenue: m.revenue, cost: m.cost, netProfit: m.profit })),
      monthly,
      bySalesperson,
    },
  };
}

// ============================================
// Sales Summary Report Service
// ============================================

interface SalesSummaryParams {
  startDate?: Date;
  endDate?: Date;
  status?: SaleStatus;
  salespersonId?: string;
}

export async function getSalesSummaryReport(params: SalesSummaryParams) {
  const { startDate, endDate, status, salespersonId } = params;

  const where: Record<string, unknown> = {};

  if (startDate && endDate) {
    where.createdAt = {
      gte: startDate,
      lte: endDate,
    };
  }

  if (status) {
    where.status = status;
  }

  if (salespersonId) {
    where.createdById = salespersonId;
  }

  const sales = await db.sale.findMany({
    where,
    include: {
      customer: { select: { name: true, type: true } },
      stock: {
        include: {
          vehicleModel: { select: { brand: true, model: true, variant: true, year: true } },
        },
      },
      vehicleModel: { select: { brand: true, model: true, variant: true, year: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const saleItems = sales.map((sale) => {
    const vehicleModel = sale.stock?.vehicleModel || sale.vehicleModel;
    const stock = sale.stock;

    const sellingPrice = toNumber(sale.totalAmount);
    // Cost calculation
    const baseCost = toNumber(stock?.baseCost) || 0;
    const transportCost = toNumber(stock?.transportCost) || 0;
    const accessoryCost = toNumber(stock?.accessoryCost) || 0;
    const otherCosts = toNumber(stock?.otherCosts) || 0;
    const totalCost = baseCost + transportCost + accessoryCost + otherCosts;
    const netProfit = sellingPrice - totalCost; // Simple Net Profit (Sale - Cost)

    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      saleDate: sale.createdAt.toISOString(),
      customerName: sale.customer.name,
      customerType: sale.customer.type,
      vehicleInfo: vehicleModel ? `${vehicleModel.brand} ${vehicleModel.model}` : 'N/A', // Shortened for report
      vehicleModelName: vehicleModel ? `${vehicleModel.brand} ${vehicleModel.model} ${vehicleModel.variant || ''}` : 'N/A',
      engineNumber: stock?.engineNumber || '-',
      chassisNumber: stock?.vin || '-',
      saleType: sale.type,
      paymentMode: sale.paymentMode,
      paymentModeLabel: PAYMENT_MODE_LABELS[sale.paymentMode as keyof typeof PAYMENT_MODE_LABELS] || sale.paymentMode,
      totalAmount: sellingPrice,
      discountAmount: toNumber(sale.discountSnapshot) || 0,
      downPayment: toNumber(sale.downPayment) || toNumber(sale.depositAmount) || 0,
      financeAmount: toNumber(sale.financeAmount) || 0,
      financeProvider: sale.financeProvider || stock?.financeProvider || '-',
      paidAmount: toNumber(sale.paidAmount),
      remainingAmount: toNumber(sale.remainingAmount),
      status: sale.status,
      statusLabel: SALE_STATUS_LABELS[sale.status as keyof typeof SALE_STATUS_LABELS] || sale.status,
      salesperson: `${sale.createdBy.firstName} ${sale.createdBy.lastName}`,
      salespersonId: sale.createdBy.id,
      
      // Cost & Profit fields
      baseCost,
      totalCost,
      netProfit,
      
      // Placeholder fields for report columns not yet in system
      financeReturn: 0, // ค่าตอบไฟแนนซ์
      transportFee: 0, // ทะเบียน/พรบ/ขนส่ง (Income or Expense?)
      campaignName: '-', // แคมเปญขาย
      salesCommission: 0, // คอมฯ พนักงานขาย
      salesExpense: 0, // ค่าใช้จ่ายในการขาย
      insurancePremium: 0, // ค่าเบี้ยประกัน
    };
  });

  // Summary
  const totalSales = saleItems.length;
  const totalAmount = saleItems.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalPaid = saleItems.reduce((sum, s) => sum + s.paidAmount, 0);
  const totalRemaining = saleItems.reduce((sum, s) => sum + s.remainingAmount, 0);
  const avgSaleAmount = totalSales > 0 ? totalAmount / totalSales : 0;

  // By salesperson
  const salespersonGroups: Record<string, { id: string; count: number; amount: number }> = {};
  saleItems.forEach((s) => {
    if (!salespersonGroups[s.salesperson]) {
      salespersonGroups[s.salesperson] = { id: s.salespersonId, count: 0, amount: 0 };
    }
    salespersonGroups[s.salesperson].count += 1;
    salespersonGroups[s.salesperson].amount += s.totalAmount;
  });

  const bySalesperson = Object.entries(salespersonGroups)
    .map(([name, data]) => ({
      id: data.id,
      name,
      saleCount: data.count,
      totalAmount: data.amount,
      percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // By status
  const statusGroups: Record<string, { count: number; amount: number }> = {};
  saleItems.forEach((s) => {
    if (!statusGroups[s.status]) {
      statusGroups[s.status] = { count: 0, amount: 0 };
    }
    statusGroups[s.status].count += 1;
    statusGroups[s.status].amount += s.totalAmount;
  });

  const byStatus = Object.entries(statusGroups).map(([status, data]) => ({
    status,
    label: SALE_STATUS_LABELS[status as keyof typeof SALE_STATUS_LABELS] || status,
    count: data.count,
    amount: data.amount,
  }));

  // By payment mode
  const paymentModeGroups: Record<string, { count: number; amount: number }> = {};
  saleItems.forEach((s) => {
    if (!paymentModeGroups[s.paymentMode]) {
      paymentModeGroups[s.paymentMode] = { count: 0, amount: 0 };
    }
    paymentModeGroups[s.paymentMode].count += 1;
    paymentModeGroups[s.paymentMode].amount += s.totalAmount;
  });

  const byPaymentMode = Object.entries(paymentModeGroups).map(([mode, data]) => ({
    mode,
    label: PAYMENT_MODE_LABELS[mode as keyof typeof PAYMENT_MODE_LABELS] || mode,
    count: data.count,
    amount: data.amount,
  }));

  // Chart data - monthly
  const monthlyGroups: Record<string, { count: number; amount: number }> = {};
  saleItems.forEach((s) => {
    const date = new Date(s.saleDate);
    const monthKey = getMonthKey(date);
    if (!monthlyGroups[monthKey]) {
      monthlyGroups[monthKey] = { count: 0, amount: 0 };
    }
    monthlyGroups[monthKey].count += 1;
    monthlyGroups[monthKey].amount += s.totalAmount;
  });

  const monthly = Object.entries(monthlyGroups).map(([month, data]) => ({
    month,
    count: data.count,
    amount: data.amount,
  }));

  // Calculate completed count and top salesperson
  const completedCount = saleItems.filter(s => s.status === 'COMPLETED').length;
  const topSalesperson = bySalesperson.length > 0 ? bySalesperson[0].name : '-';

  // Build bySalesperson with more detailed info
  const salespersonDetailedGroups: Record<string, { 
    id: string; 
    count: number; 
    amount: number; 
    pending: number; 
    completed: number; 
    canceled: number; 
  }> = {};

  saleItems.forEach((s) => {
    if (!salespersonDetailedGroups[s.salesperson]) {
      salespersonDetailedGroups[s.salesperson] = { 
        id: s.salespersonId, 
        count: 0, 
        amount: 0, 
        pending: 0, 
        completed: 0, 
        canceled: 0 
      };
    }
    salespersonDetailedGroups[s.salesperson].count += 1;
    salespersonDetailedGroups[s.salesperson].amount += s.totalAmount;
    
    if (s.status === 'RESERVED' || s.status === 'PREPARING') {
      salespersonDetailedGroups[s.salesperson].pending += 1;
    } else if (s.status === 'COMPLETED' || s.status === 'DELIVERED') {
      salespersonDetailedGroups[s.salesperson].completed += 1;
    } else if (s.status === 'CANCELLED') {
      salespersonDetailedGroups[s.salesperson].canceled += 1;
    }
  });

  const bySalespersonDetailed = Object.entries(salespersonDetailedGroups)
    .map(([name, data]) => ({
      id: data.id,
      salesperson: name,
      totalSales: data.count,
      pendingCount: data.pending,
      completedCount: data.completed,
      canceledCount: data.canceled,
      totalAmount: data.amount,
      commission: Math.round(data.amount * 0.01), // Example 1% commission
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    sales: saleItems,
    bySalesperson: bySalespersonDetailed,
    summary: {
      totalSales,
      totalCount: totalSales,
      totalAmount,
      totalPaid,
      totalRemaining,
      avgSaleAmount: Math.round(avgSaleAmount),
      averageAmount: Math.round(avgSaleAmount),
      completedCount,
      topSalesperson,
      bySalesperson,
      byStatus,
      byPaymentMode,
    },
    chartData: {
      monthly,
      bySalesperson: bySalesperson.slice(0, 10).map((s) => ({
        name: s.name,
        count: s.saleCount,
        amount: s.totalAmount,
      })),
      byStatus: byStatus.map((s) => ({
        status: s.status,
        label: s.label,
        count: s.count,
        amount: s.amount,
      })),
    },
  };
}

// ============================================
// Stock Interest Report Service
// ============================================

interface StockInterestParams {
  startDate?: Date;
  endDate?: Date;
  status?: StockStatus;
  isCalculating?: boolean;
  brand?: string;
}

export async function getStockInterestReport(params: StockInterestParams) {
  const { status, isCalculating, brand } = params;

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  if (isCalculating === true) {
    where.stopInterestCalc = false;
    where.debtStatus = { not: 'PAID_OFF' };
  } else if (isCalculating === false) {
    where.OR = [
      { stopInterestCalc: true },
      { debtStatus: 'PAID_OFF' },
    ];
  }

  if (brand) {
    where.vehicleModel = { brand };
  }

  const stocks = await db.stock.findMany({
    where,
    include: {
      vehicleModel: {
        select: { brand: true, model: true, variant: true, year: true },
      },
      interestPeriods: {
        orderBy: { startDate: 'desc' },
      },
      debtPayments: {
        orderBy: { paymentDate: 'desc' },
      },
    },
    orderBy: { arrivalDate: 'desc' },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stockItems = stocks.map((stock) => {
    const interestStartDate = stock.orderDate || stock.arrivalDate;
    const endDate = stock.soldDate || today;
    const daysCount = calculateDays(interestStartDate, endDate);

    const baseCost = toNumber(stock.baseCost);
    const totalCost = baseCost + toNumber(stock.transportCost) + toNumber(stock.accessoryCost) + toNumber(stock.otherCosts);

    // Calculate accumulated interest from all periods
    let totalAccumulatedInterest = 0;
    let currentRate = toNumber(stock.interestRate) * 100;
    let principalBase = stock.interestPrincipalBase;
    let principalAmount = principalBase === 'BASE_COST_ONLY' ? baseCost : totalCost;

    // Get active period
    const activePeriod = stock.interestPeriods.find((p) => !p.endDate);

    if (activePeriod) {
      currentRate = toNumber(activePeriod.annualRate);
      principalBase = activePeriod.principalBase;
      principalAmount = toNumber(activePeriod.principalAmount);

      // Calculate interest for active period up to today
      const periodDays = calculateDays(activePeriod.startDate, today);
      const activeInterest = calculateInterest(principalAmount, currentRate, periodDays);
      totalAccumulatedInterest += activeInterest;
    } else if (stock.interestPeriods.length === 0 && !stock.stopInterestCalc && stock.debtStatus !== 'PAID_OFF') {
      // No periods yet, use stock's default rate
      totalAccumulatedInterest = calculateInterest(principalAmount, currentRate, daysCount);
    }

    // Add closed periods' interest
    stock.interestPeriods
      .filter((p) => p.endDate)
      .forEach((p) => {
        totalAccumulatedInterest += toNumber(p.calculatedInterest);
      });

    const isCalculatingNow = !stock.stopInterestCalc && stock.debtStatus !== 'PAID_OFF';
    const vehicleInfo = `${stock.vehicleModel.brand} ${stock.vehicleModel.model} ${stock.vehicleModel.variant || ''} ${stock.vehicleModel.year}`.trim();

    // ดอกเบี้ยที่จ่ายแล้ว = ใช้ค่าจาก paidInterestAmount ที่ track ไว้ใน Stock
    // (ถูก update ทุกครั้งที่มีการจ่ายหนี้ผ่าน recordDebtPayment)
    let paidInterest = toNumber(stock.paidInterestAmount);
    
    // ดอกเบี้ยค้างชำระ = ดอกเบี้ยสะสมทั้งหมด - ดอกเบี้ยที่จ่ายแล้ว
    let pendingInterest = Math.max(0, totalAccumulatedInterest - paidInterest);

    // ถ้าปิดหนี้แล้ว = ดอกเบี้ยทั้งหมดถือว่าจ่ายแล้ว
    if (stock.debtStatus === 'PAID_OFF') {
      paidInterest = totalAccumulatedInterest;
      pendingInterest = 0;
    } else if (stock.status === 'SOLD' && !stock.financeProvider) {
      // ไม่มีไฟแนนซ์ แต่ขายแล้ว = ดอกเบี้ยทั้งหมดถือว่าจ่ายแล้ว (รวมในราคาขาย)
      paidInterest = totalAccumulatedInterest;
      pendingInterest = 0;
    }

    return {
      stockId: stock.id,
      vin: stock.vin,
      vehicleInfo,
      brand: stock.vehicleModel.brand,
      model: stock.vehicleModel.model,
      variant: stock.vehicleModel.variant,
      year: stock.vehicleModel.year,
      exteriorColor: stock.exteriorColor,
      status: stock.status,
      statusLabel: STOCK_STATUS_LABELS[stock.status as keyof typeof STOCK_STATUS_LABELS] || stock.status,
      arrivalDate: stock.arrivalDate.toISOString(),
      orderDate: stock.orderDate?.toISOString(),
      interestStartDate: interestStartDate.toISOString(),
      daysInStock: daysCount,
      daysCount,
      currentRate,
      interestRate: currentRate,
      principalBase,
      principalAmount,
      baseCost,
      totalInterest: Math.round(totalAccumulatedInterest * 100) / 100,
      paidInterest: Math.round(paidInterest * 100) / 100,
      pendingInterest: Math.round(pendingInterest * 100) / 100,
      totalCostWithInterest: Math.round((baseCost + totalAccumulatedInterest) * 100) / 100,
      accumulatedInterest: Math.round(totalAccumulatedInterest * 100) / 100,
      isCalculating: isCalculatingNow,
      debtStatus: stock.debtStatus,
      debtAmount: toNumber(stock.debtAmount),
      paidDebtAmount: toNumber(stock.paidDebtAmount),
      remainingDebt: toNumber(stock.remainingDebt),
    };
  });

  // Summary
  const totalInterest = stockItems.reduce((sum, s) => sum + s.accumulatedInterest, 0);
  const totalBaseCost = stockItems.reduce((sum, s) => sum + s.baseCost, 0);
  const paidInterest = stockItems.reduce((sum, s) => sum + s.paidInterest, 0);
  const pendingInterest = stockItems.reduce((sum, s) => sum + s.pendingInterest, 0);
  const calculatingCount = stockItems.filter((s) => s.isCalculating).length;
  const stoppedCount = stockItems.filter((s) => !s.isCalculating).length;
  const totalStockCount = stockItems.length;
  const avgRate = totalStockCount > 0 
    ? stockItems.reduce((sum, s) => sum + s.currentRate, 0) / totalStockCount 
    : 0;
  const avgDaysInStock = totalStockCount > 0 
    ? stockItems.reduce((sum, s) => sum + s.daysCount, 0) / totalStockCount 
    : 0;
  const averageInterestPerDay = avgDaysInStock > 0 && totalStockCount > 0
    ? totalInterest / (avgDaysInStock * totalStockCount)
    : 0;
  
  // Calculate overdue vehicles (more than 90 days in stock)
  const overdueVehicles = stockItems.filter(s => s.daysCount > 90 && s.status !== 'SOLD').length;
  const overdueInterest = stockItems.filter(s => s.daysCount > 90 && s.status !== 'SOLD').reduce((sum, s) => sum + s.accumulatedInterest, 0);

  // Chart data - by status
  const statusGroups: Record<string, number> = {};
  stockItems.forEach((s) => {
    statusGroups[s.status] = (statusGroups[s.status] || 0) + s.accumulatedInterest;
  });

  const byStatus = Object.entries(statusGroups).map(([status, interest]) => ({
    status,
    label: STOCK_STATUS_LABELS[status as keyof typeof STOCK_STATUS_LABELS] || status,
    interest: Math.round(interest * 100) / 100,
  }));

  // By brand
  const brandGroups: Record<string, { interest: number; count: number }> = {};
  stockItems.forEach((s) => {
    if (!brandGroups[s.brand]) {
      brandGroups[s.brand] = { interest: 0, count: 0 };
    }
    brandGroups[s.brand].interest += s.accumulatedInterest;
    brandGroups[s.brand].count += 1;
  });

  const byBrand = Object.entries(brandGroups)
    .map(([brand, data]) => ({
      brand,
      interest: Math.round(data.interest * 100) / 100,
      count: data.count,
    }))
    .sort((a, b) => b.interest - a.interest);

  // Monthly (based on arrival date)
  const monthlyGroups: Record<string, { interest: number; paidInterest: number }> = {};
  stockItems.forEach((s) => {
    const date = new Date(s.arrivalDate);
    const monthKey = getMonthKey(date);
    if (!monthlyGroups[monthKey]) {
      monthlyGroups[monthKey] = { interest: 0, paidInterest: 0 };
    }
    monthlyGroups[monthKey].interest += s.accumulatedInterest;
    // ใช้ paidInterest ที่คำนวณไว้แล้ว (จาก paidInterestAmount)
    monthlyGroups[monthKey].paidInterest += s.paidInterest;
  });

  const monthly = Object.entries(monthlyGroups).map(([month, data]) => ({
    month,
    interest: Math.round(data.interest * 100) / 100,
    paidInterest: Math.round(data.paidInterest * 100) / 100,
  }));

  return {
    items: stockItems,
    stocks: stockItems,
    summary: {
      totalInterest: Math.round(totalInterest * 100) / 100,
      paidInterest: Math.round(paidInterest * 100) / 100,
      pendingInterest: Math.round(pendingInterest * 100) / 100,
      totalVehicles: totalStockCount,
      totalBaseCost: Math.round(totalBaseCost * 100) / 100,
      averageInterestPerDay: Math.round(averageInterestPerDay * 100) / 100,
      overdueVehicles,
      overdueInterest: Math.round(overdueInterest * 100) / 100,
      calculatingCount,
      stoppedCount,
      totalStockCount,
      avgRate: Math.round(avgRate * 100) / 100,
      avgDaysInStock: Math.round(avgDaysInStock),
    },
    chartData: {
      monthlyInterest: monthly,
      monthly,
      byStatus,
      byBrand: byBrand.slice(0, 10),
    },
  };
}

export const reportsService = {
  getDailyPaymentReport,
  getStockReport,
  getProfitLossReport,
  getSalesSummaryReport,
  getStockInterestReport,
};
