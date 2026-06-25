const round2 = (n: number) => Math.round(n * 100) / 100;

/** Rate applied on top of staff sales commission (customer-specified 8%). */
const COMMISSION_VAT_RATE = 0.08;

/** One sale's fields needed to build the per-salesperson breakdown. */
export interface SalespersonSaleInput {
  salesperson: string;
  salespersonId: string;
  totalAmount: number;
  status: string;
  /** ค่าคอมฯ พนักงานขาย as typed on the sale (sale.salesCommission). */
  salesCommission: number;
}

export interface SalespersonBreakdownRow {
  id: string;
  salesperson: string;
  totalSales: number;
  pendingCount: number;
  completedCount: number;
  canceledCount: number;
  totalAmount: number;
  /** Sum of the entered salesCommission for this salesperson. */
  commission: number;
  commissionVat: number;
  commissionWithVat: number;
}

/**
 * Group sales by salesperson for the sales-summary report.
 *
 * `commission` is the SUM of the salesCommission actually entered on each sale —
 * not a derived percentage. (Previously this was `amount * 0.01`, which ignored
 * the value the user typed on the sale page; customer-reported bug B6.)
 */
export function buildSalespersonBreakdown(
  sales: SalespersonSaleInput[]
): SalespersonBreakdownRow[] {
  const groups: Record<
    string,
    {
      id: string;
      salesperson: string;
      count: number;
      amount: number;
      commission: number;
      pending: number;
      completed: number;
      canceled: number;
    }
  > = {};

  for (const s of sales) {
    if (!groups[s.salesperson]) {
      groups[s.salesperson] = {
        id: s.salespersonId,
        salesperson: s.salesperson,
        count: 0,
        amount: 0,
        commission: 0,
        pending: 0,
        completed: 0,
        canceled: 0,
      };
    }
    const g = groups[s.salesperson];
    g.count += 1;
    g.amount += s.totalAmount;
    g.commission += s.salesCommission;

    if (s.status === 'RESERVED' || s.status === 'PREPARING') {
      g.pending += 1;
    } else if (s.status === 'COMPLETED' || s.status === 'DELIVERED') {
      g.completed += 1;
    } else if (s.status === 'CANCELLED') {
      g.canceled += 1;
    }
  }

  return Object.values(groups)
    .map((g) => {
      const commission = round2(g.commission);
      const commissionVat = round2(commission * COMMISSION_VAT_RATE);
      return {
        id: g.id,
        salesperson: g.salesperson,
        totalSales: g.count,
        pendingCount: g.pending,
        completedCount: g.completed,
        canceledCount: g.canceled,
        totalAmount: g.amount,
        commission,
        commissionVat,
        commissionWithVat: round2(commission + commissionVat),
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);
}
