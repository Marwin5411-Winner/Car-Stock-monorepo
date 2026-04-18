/**
 * PDF Controller
 * API endpoints for PDF generation
 */

import { Elysia, t } from 'elysia';
import { pdfService } from './pdf.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS } from '@car-stock/shared/constants';
import { db } from '../../lib/db';
import { reportsService } from '../reports/reports.service';
import {
  DeliveryReceiptData,
  ThankYouLetterData,
  SalesConfirmationData,
  SalesRecordData,
  ContractData,
  DepositReceiptData,
  PaymentReceiptData,
  VehicleCardData,
  TemporaryReceiptData,
  CustomerInfo,
  CarInfo,
} from './types';
import { formatThaiDate, numberToThaiText } from './helpers';
import { generateContractNumber, getCurrentContractNumberFormat } from '../../lib/contractNumber';

// Helper function to transform customer data
function transformCustomer(customer: any): CustomerInfo {
  return {
    name: customer?.name || '-',
    address: customer?.houseNumber || '-', // mapped from houseNumber
    street: customer?.street || '-',
    subdistrict: customer?.subdistrict || '-',
    district: customer?.district || '-',
    province: customer?.province || '-',
    postalCode: customer?.postalCode || '-',
    phone: customer?.phone || '-',
    taxId: customer?.taxId,
  };
}

// Helper function to transform stock/vehicle data
function transformCar(stock: any): CarInfo {
  return {
    brand: stock?.vehicleModel?.brand || '-',
    model: stock?.vehicleModel?.model || '-',
    engineNo: stock?.engineNumber || stock?.motorNumber1 || '-',
    chassisNo: stock?.vin || '-', // VIN is the chassis number
    color: stock?.exteriorColor || '-',
    type: 'รถยนต์ไฟฟ้า',
  };
}

// Helper to get company header from settings or default
async function getCompanyHeader(): Promise<any> {
  const settings = await db.companySettings.findFirst();
  if (settings) {
    return {
      logoBase64: settings.logo || '',
      companyName: settings.companyNameTh,
      companyNameEn: settings.companyNameEn,
      address1: settings.addressTh,
      address2: '',
      phone: `โทร. ${settings.phone}${settings.fax ? ` โทรสาร. ${settings.fax}` : ''}`,
      taxId: settings.taxId,
      fax: settings.fax || '',
      mobile: settings.mobile,
      email: settings.email,
    };
  }

  // Fallback — should not reach here if settings are configured
  return {
    logoBase64: '',
    companyName: '(กรุณาตั้งค่าข้อมูลบริษัทใน Settings)',
    companyNameEn: '',
    address1: '',
    address2: '',
    phone: '',
    taxId: '',
    fax: '',
    mobile: '',
    email: '',
  };
}

const calculateDays = (startDate: Date, endDate: Date): number => {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

const calculateAccumulatedInterest = (stock: any): number => {
  if (!stock?.financeProvider) {
    return 0;
  }

  const baseCost = Number(stock.baseCost || 0);
  const transportCost = Number(stock.transportCost || 0);
  const accessoryCost = Number(stock.accessoryCost || 0);
  const otherCosts = Number(stock.otherCosts || 0);
  const totalCost = baseCost + transportCost + accessoryCost + otherCosts;
  const principalAmount = stock.interestPrincipalBase === 'BASE_COST_ONLY' ? baseCost : totalCost;
  const today = new Date();
  const activeEndDate = stock.soldDate || today;
  const interestStartDate = stock.orderDate || stock.arrivalDate;
  const hasStopDate = stock.stopInterestCalc && stock.interestStoppedAt;
  const endDate = hasStopDate
    ? new Date(Math.min(activeEndDate.getTime(), stock.interestStoppedAt.getTime()))
    : activeEndDate;
  const canAccrueActiveInterest = stock.debtStatus !== 'PAID_OFF' && !stock.stopInterestCalc;

  if (stock.interestPeriods?.length) {
    let totalAccumulatedInterest = 0;

    stock.interestPeriods.forEach((period: any) => {
      if (period.endDate) {
        totalAccumulatedInterest += Number(period.calculatedInterest);
        return;
      }

      if (!canAccrueActiveInterest) {
        return;
      }

      const days = calculateDays(period.startDate, activeEndDate);
      const dailyRate = Number(period.annualRate) / 100 / 365;
      totalAccumulatedInterest += Number(period.principalAmount) * dailyRate * days;
    });

    return totalAccumulatedInterest;
  }

  const canAccrueInterest = stock.debtStatus !== 'PAID_OFF' || hasStopDate;
  if (!canAccrueInterest) {
    return 0;
  }

  const days = calculateDays(interestStartDate, endDate);
  const dailyRate = Number(stock.interestRate || 0) / 365;
  return principalAmount * dailyRate * days;
};

export const pdfRoutes = new Elysia({ prefix: '/pdf' })
  /**
   * Generate Delivery Receipt PDF (ใบปล่อยรถ/ใบรับรถ)
   */
  .get(
    '/delivery-receipt/:saleId',
    async ({ params, set }) => {
      const sale = await db.sale.findUnique({
        where: { id: params.saleId },
        include: {
          customer: true,
          stock: {
            include: {
              vehicleModel: true,
            },
          },
        },
      });

      if (!sale) {
        set.status = 404;
        return { success: false, error: 'Sale not found' };
      }

      const header = await getCompanyHeader();
      // If logo is missing in settings, try to load default from service (or handle it in getCompanyHeader)
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: DeliveryReceiptData = {
        header,
        customer: transformCustomer(sale.customer),
        car: transformCar(sale.stock),
        deliveryDate: sale.deliveryDate ? formatThaiDate(sale.deliveryDate) : undefined,
      };



      const pdfBuffer = await pdfService.generateDeliveryReceipt(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="delivery-receipt-${sale.saleNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        saleId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Delivery Receipt PDF',
        description: 'Generate ใบปล่อยรถ/ใบรับรถ PDF for a sale',
      },
    }
  )

  /**
   * Generate Thank You Letter PDF (หนังสือขอบคุณ)
   */
  .get(
    '/thank-you-letter/:saleId',
    async ({ params, set }) => {
      const sale = await db.sale.findUnique({
        where: { id: params.saleId },
        include: {
          customer: true,
          stock: {
            include: {
              vehicleModel: true,
            },
          },
          payments: true,
        },
      });

      if (!sale) {
        set.status = 404;
        return { success: false, error: 'Sale not found' };
      }

      const car = transformCar(sale.stock);

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: ThankYouLetterData = {
        header,
        thaiDate: formatThaiDate(new Date(), 'full'),
        customerName: sale.customer?.name || '-',
        carBrand: car.brand,
        detailsTable: {
          sellingPrice: sale.totalAmount?.toString() || '0',
          discount: sale.discountSnapshot?.toString() || '0',
          remaining: sale.remainingAmount?.toString() || '0',
          downPayment: sale.downPayment?.toString() || sale.depositAmount?.toString() || '0',
          downPaymentDiscount: '0',
          insurance: '0', // Not in schema - to be added if needed
          actInsurance: '0', // Not in schema - to be added if needed
          registrationFee: '0', // Not in schema - to be added if needed
          totalDelivery: sale.paidAmount?.toString() || '0',
          financeAmount: sale.financeAmount?.toString() || '0',
          interestRate: '0', // Not in schema - to be added if needed
          installmentMonths: '0', // Not in schema - to be added if needed
          monthlyPayment: '0', // Not in schema - to be added if needed
          gifts: [], // TODO: Parse from freebiesSnapshot if available
        },
        contactPerson: {
          name: 'นายณัฐนันท์ คมฤทัย',
          phone: 'โทร.(044) 272888, 094-978-9926',
          position: 'ฝ่ายตรวจสอบ',
        },
      };

      const pdfBuffer = await pdfService.generateThankYouLetter(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="thank-you-letter-${sale.saleNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        saleId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Thank You Letter PDF',
        description: 'Generate หนังสือขอบคุณ PDF for a sale',
      },
    }
  )

  /**
   * Generate Sales Confirmation PDF (หนังสือยืนยันการซื้อ-ขาย)
   */
  .get(
    '/sales-confirmation/:saleId',
    async ({ params, set }) => {
      const sale = await db.sale.findUnique({
        where: { id: params.saleId },
        include: {
          customer: true,
          stock: {
            include: {
              vehicleModel: true,
            },
          },
        },
      });

      if (!sale) {
        set.status = 404;
        return { success: false, error: 'Sale not found' };
      }

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: SalesConfirmationData = {
        header,
        createdDate: sale.createdAt.toISOString(),
        car: transformCar(sale.stock),
        customer: transformCustomer(sale.customer),
        paymentMethod: sale.paymentMode === 'CASH' ? 'เงินสด' : sale.paymentMode === 'FINANCE' ? 'บริษัทไฟแนนซ์' : sale.paymentMode,
      };

      const pdfBuffer = await pdfService.generateSalesConfirmation(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="sales-confirmation-${sale.saleNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        saleId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Sales Confirmation PDF',
        description: 'Generate หนังสือยืนยันการซื้อ-ขาย PDF for a sale',
      },
    }
  )

  /**
   * Generate Sales Record PDF (ใบบันทึกการขาย)
   */
  .get(
    '/sales-record/:saleId',
    async ({ params, set }) => {
      const sale = await db.sale.findUnique({
        where: { id: params.saleId },
        include: {
          customer: true,
          stock: {
            include: {
              vehicleModel: true,
            },
          },
          createdBy: true,
        },
      });

      if (!sale) {
        set.status = 404;
        return { success: false, error: 'Sale not found' };
      }

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: SalesRecordData = {
        header,
        customer: transformCustomer(sale.customer),
        car: transformCar(sale.stock),
        pricing: {
          sellingPrice: sale.totalAmount?.toString() || '0',
          remaining: sale.remainingAmount?.toString() || '0',
          downPayment: sale.downPayment?.toString() || sale.depositAmount?.toString() || '0',
          downPaymentDiscount: '0',
          insurance: '0', // Not in schema
          actInsurance: '0', // Not in schema
          registrationFee: '0', // Not in schema
          totalDelivery: sale.paidAmount?.toString() || '0',
          financeAmount: sale.financeAmount?.toString() || '0',
          deductDeposit: sale.paidAmount?.toString() || '0',
          deliveryAmount: sale.paidAmount?.toString() || '0',
          outstandingBalance: sale.remainingAmount?.toString() || '0',
          paymentDueDate: sale.expirationDate ? formatThaiDate(sale.expirationDate, 'short') : '-',
          financeCompany: sale.financeProvider || '-',
          interestRate: '0', // Not in Sale schema
          installmentMonths: '0', // Not in schema
          monthlyPayment: '0', // Not in schema
        },
        gifts: [], // TODO: Parse from freebiesSnapshot if available
        staff: {
          salesConsultant: sale.createdBy ? `${sale.createdBy.firstName} ${sale.createdBy.lastName}` : '-',
          salesManager: '-',
          auditor: '-',
        },
      };

      const pdfBuffer = await pdfService.generateSalesRecord(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="sales-record-${sale.saleNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_SALES_RECORD')],
      params: t.Object({
        saleId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Sales Record PDF',
        description: 'Generate ใบบันทึกการขาย PDF for a sale',
      },
    }
  )

  /**
   * Generate Contract PDF (สัญญาจองรถยนต์)
   */
  .get(
    '/contract/:saleId',
    async ({ params, set }) => {
      const sale = await db.sale.findUnique({
        where: { id: params.saleId },
        include: {
          customer: true,
          vehicleModel: true,
          stock: {
            include: {
              vehicleModel: true,
            },
          },
          payments: {
            orderBy: {
              paymentDate: 'asc',
            },
            take: 1, // Get the first payment as reservation/deposit
          },
          createdBy: true,
        },
      });

      if (!sale) {
        set.status = 404;
        return { success: false, error: 'Sale not found' };
      }

      const car = transformCar(sale.stock);

      // Get reservation payment (first payment)
      const reservationPayment = sale.payments && sale.payments.length > 0 ? sale.payments[0] : null;

      // Get or generate contract number (เล่มที่ and เลขที่)
      // If the Sale already has a contract number, use it; otherwise generate a new one and save it
      let contractNumber: { volumeNumber: string; documentNumber: string };

      if (sale.contractVolumeNumber && sale.contractDocumentNumber) {
        // Use existing contract number
        contractNumber = {
          volumeNumber: sale.contractVolumeNumber,
          documentNumber: sale.contractDocumentNumber,
        };
      } else {
        // Generate new contract number and save to Sale
        contractNumber = await generateContractNumber();
        await db.sale.update({
          where: { id: sale.id },
          data: {
            contractVolumeNumber: contractNumber.volumeNumber,
            contractDocumentNumber: contractNumber.documentNumber,
          },
        });
      }

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: any = { // Using any to bypass strict type check for now to support the template
        copyTypes: [
          { thai: 'ต้นฉบับ', english: 'ORIGINAL' },
          { thai: 'คู่ฉบับ', english: 'DUPLICATE' },
          { thai: 'สำเนาคู่ฉบับ', english: 'COPY' },
        ],
        header,
        documentInfo: {
          volumeNumber: contractNumber.volumeNumber, // เล่มที่ e.g., "01/2568"
          documentNumber: contractNumber.documentNumber, // เลขที่ e.g., "68010001"
          contractLocation: header.companyName,
          salesManagerName: '', // Placeholder, no data available on sale object
          salesManagerPhone: '',
          salesStaffName: sale.createdBy ? `${sale.createdBy.firstName} ${sale.createdBy.lastName}` : '-',
          salesStaffPhone: sale.createdBy?.phone || '-',
        },
        reservationNumber: sale.saleNumber,
        date: {
          day: new Date().getDate().toString(),
          month: (new Date().getMonth() + 1).toString(),
          year: (new Date().getFullYear() + 543).toString(),
        },
        customer: transformCustomer(sale.customer),
        vehicleModel: sale.stock?.vehicleModel || sale.vehicleModel,
        financial: {
          totalPrice: sale.totalAmount?.toString() || '0',
          depositAmount: sale.depositAmount?.toString() || '0',
          refundPolicy: 'ตามข้อตกลง',
        },
        reservationFee: reservationPayment ? {
          amount: reservationPayment.amount.toString(),
          isCash: reservationPayment.paymentMethod === 'CASH',
          isBankTransfer: reservationPayment.paymentMethod === 'BANK_TRANSFER',
          isCreditCard: reservationPayment.paymentMethod === 'CREDIT_CARD',
          isCheque: reservationPayment.paymentMethod === 'CHEQUE',
          bank: reservationPayment.receivingBank || '',
          accountNo: '', // Not available in Payment model
          chequeNo: reservationPayment.referenceNumber || '',
          chequeDate: reservationPayment.paymentDate ? formatThaiDate(reservationPayment.paymentDate) : '',
        } : {
          amount: '0',
          isCash: false,
          isBankTransfer: false,
          isCreditCard: false,
          isCheque: false,
        }
      };

      const pdfBuffer = await pdfService.generateContract(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="contract-${sale.saleNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        saleId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Contract PDF',
        description: 'Generate สัญญาจองรถยนต์ PDF for a sale',
      },
    }
  )

  /**
   * Generate Deposit Receipt PDF (ใบรับเงินมัดจำ)
   */
  .get(
    '/deposit-receipt/:paymentId',
    async ({ params, set }) => {
      const payment = await db.payment.findUnique({
        where: { id: params.paymentId },
        include: {
          customer: true,
          sale: {
            include: {
              customer: true,
              stock: {
                include: {
                  vehicleModel: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        set.status = 404;
        return { success: false, error: 'Payment not found' };
      }

      const sale = payment.sale;
      const customer = payment.customer || sale?.customer;

      // Build items: payment type label as main item, description as sub-item
      const typeLabel = PAYMENT_TYPE_LABELS[payment.paymentType as keyof typeof PAYMENT_TYPE_LABELS] || 'ค่าชำระเงิน';
      const carName = sale?.stock?.vehicleModel ? `${sale.stock.vehicleModel.brand} ${sale.stock.vehicleModel.model}` : '';
      const methodLabel = PAYMENT_METHOD_LABELS[payment.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || '';
      const mainItem = `${typeLabel}${carName ? ` - ${carName}` : ''}`;
      const items: { description: string; amount: string }[] = [
        { description: mainItem, amount: payment.amount.toString() },
      ];
      if (payment.description) {
        items.push({ description: payment.description, amount: '' });
      }

      // Determine payment method
      const paymentMethodData = {
        isCash: payment.paymentMethod === 'CASH',
        isCheque: payment.paymentMethod === 'CHEQUE',
        isTransfer: payment.paymentMethod === 'BANK_TRANSFER',
        bankName: payment.receivingBank || '',
        branchName: '',
        accountNumber: '',
        transferAmount: payment.paymentMethod === 'BANK_TRANSFER' ? payment.amount.toString() : '',
      };

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: TemporaryReceiptData = {
        header: {
          ...header,
          fax: '',
        },
        customerCode: customer?.code || '',
        receiptNumber: payment.receiptNumber,
        date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
        contractNumber: sale?.saleNumber || '',
        customer: transformCustomer(customer),
        items,
        paymentAmount: payment.amount.toString(),
        lateFee: '0',
        discount: '0',
        totalAmount: payment.amount.toString(),
        totalAmountText: numberToThaiText(Number(payment.amount)),
        paymentMethod: paymentMethodData,
        paymentMethodLabel: methodLabel,
        note: payment.notes || undefined,
      };

      const pdfBuffer = await pdfService.generateTemporaryReceipt(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="deposit-receipt-${payment.receiptNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        paymentId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Deposit Receipt PDF',
        description: 'Generate ใบรับเงินมัดจำ PDF for a payment',
      },
    }
  )

  /**
   * Generate Payment Receipt PDF (ใบเสร็จรับเงิน)
   */
  .get(
    '/payment-receipt/:paymentId',
    async ({ params, set }) => {
      const payment = await db.payment.findUnique({
        where: { id: params.paymentId },
        include: {
          customer: true,
          sale: {
            include: {
              customer: true,
              stock: {
                include: {
                  vehicleModel: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        set.status = 404;
        return { success: false, error: 'Payment not found' };
      }

      const sale = payment.sale;
      const customer = payment.customer || sale?.customer;

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      // Build items from payment notes/description
      const items = [];
      if (payment.notes) {
        // Split notes by newline to create multiple items
        const lines = payment.notes.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          items.push({ description: line.trim(), amount: '' });
        }
      }
      if (items.length === 0) {
        // Default item based on payment type
        const typeLabels: Record<string, string> = {
          DEPOSIT: 'ค่ามัดจำ',
          DOWN_PAYMENT: 'ค่าเงินดาวน์',
          FINANCE_PAYMENT: 'ค่างวดไฟแนนซ์',
          OTHER_EXPENSE: 'ค่าใช้จ่ายอื่นๆ',
          MISCELLANEOUS: 'เบ็ดเตล็ด',
        };
        const label = typeLabels[payment.paymentType] || 'ค่าชำระเงิน';
        const carName = sale?.stock?.vehicleModel ? `${sale.stock.vehicleModel.brand} ${sale.stock.vehicleModel.model}` : '';
        items.push({ description: `${label} ${carName}`.trim(), amount: payment.amount.toString() });
      }

      const data: PaymentReceiptData = {
        header,
        receiptNumber: payment.receiptNumber,
        date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
        customer: transformCustomer(customer),
        car: transformCar(sale?.stock),
        items,
        amount: payment.amount.toString(),
        amountText: numberToThaiText(Number(payment.amount)),
        paymentMethod: payment.paymentMethod || 'CASH',
        note: payment.notes || undefined,
      };

      const pdfBuffer = await pdfService.generatePaymentReceipt(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="payment-receipt-${payment.receiptNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        paymentId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Payment Receipt PDF',
        description: 'Generate ใบเสร็จรับเงิน PDF for a payment',
      },
    }
  )

  /**
   * Generate Vehicle Card PDF (การ์ดรายละเอียดรถยนต์)
   */
  .get(
    '/vehicle-card/:stockId',
    async ({ params, set }) => {
      const stock = await db.stock.findUnique({
        where: { id: params.stockId },
        include: {
          vehicleModel: true,
          interestPeriods: {
            select: {
              startDate: true,
              endDate: true,
              annualRate: true,
              principalAmount: true,
              calculatedInterest: true,
            },
          },
        },
      });

      if (!stock) {
        set.status = 404;
        return { success: false, error: 'Stock not found' };
      }

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const accumulatedInterest = calculateAccumulatedInterest(stock);
      const baseCost = Number(stock.baseCost || 0);
      const transportCost = Number(stock.transportCost || 0);
      const accessoryCost = Number(stock.accessoryCost || 0);
      const otherCosts = Number(stock.otherCosts || 0);
      const totalCost = baseCost + transportCost + accessoryCost + otherCosts + accumulatedInterest;

      // VAT calculations (baseCost includes VAT)
      const beforeVat = baseCost / 1.07;
      const vatAmount = baseCost - beforeVat;

      const splitAmount = (amount: number) => {
        const fixed = amount.toFixed(2);
        const [intPart, decPart] = fixed.split('.');
        return {
          full: Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          int: Number(intPart).toLocaleString('en-US'),
          dec: decPart,
        };
      };

      const beforeVatParts = splitAmount(beforeVat);
      const vatParts = splitAmount(vatAmount);
      const totalVatParts = splitAmount(baseCost);

      const data: VehicleCardData = {
        header,
        stockNumber: stock.stockNumber || '-',
        date: formatThaiDate(new Date()),
        car: {
          brand: stock.vehicleModel?.brand || '-',
          model: stock.vehicleModel?.model || '-',
          variant: stock.vehicleModel?.variant || '',
          year: stock.vehicleModel?.year?.toString() || '-',
          color: stock.exteriorColor || '-',
          interiorColor: stock.interiorColor || '-',
          engineNo: stock.engineNumber || '-',
          chassisNo: stock.vin || '-',
          ccOrKw: '-',
        },
        costs: {
          baseCost: baseCost.toString(),
          beforeVat: beforeVatParts.full,
          beforeVatInt: beforeVatParts.int,
          beforeVatDec: beforeVatParts.dec,
          vatAmount: vatParts.full,
          vatAmountInt: vatParts.int,
          vatAmountDec: vatParts.dec,
          totalWithVat: totalVatParts.full,
          totalWithVatInt: totalVatParts.int,
          totalWithVatDec: totalVatParts.dec,
          transportCost: transportCost.toString(),
          accessoryCost: accessoryCost.toString(),
          otherCosts: otherCosts.toString(),
          totalCost: totalCost.toString(),
        },
        location: stock.parkingSlot || '-',
      };

      const pdfBuffer = await pdfService.generateVehicleCard(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="vehicle-card-${stock.vin}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_CAR_DETAIL_CARD')],
      params: t.Object({
        stockId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Vehicle Card PDF',
        description: 'Generate การ์ดรายละเอียดรถยนต์ PDF for a stock',
      },
    }
  )

  /**
   * Generate Vehicle Card Template PDF (การ์ดรายละเอียดรถยนต์ - แบบไม่มีกรอบ)
   */
  .get(
    '/vehicle-card-template/:stockId',
    async ({ params, set }) => {
      const stock = await db.stock.findUnique({
        where: { id: params.stockId },
        include: {
          vehicleModel: true,
          interestPeriods: {
            select: {
              startDate: true,
              endDate: true,
              annualRate: true,
              principalAmount: true,
              calculatedInterest: true,
            },
          },
        },
      });

      if (!stock) {
        set.status = 404;
        return { success: false, error: 'Stock not found' };
      }

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const accumulatedInterest = calculateAccumulatedInterest(stock);
      const baseCost = Number(stock.baseCost || 0);
      const transportCost = Number(stock.transportCost || 0);
      const accessoryCost = Number(stock.accessoryCost || 0);
      const otherCosts = Number(stock.otherCosts || 0);
      const totalCost = baseCost + transportCost + accessoryCost + otherCosts + accumulatedInterest;

      // VAT calculations (baseCost includes VAT)
      const beforeVat = baseCost / 1.07;
      const vatAmount = baseCost - beforeVat;

      const splitAmount = (amount: number) => {
        const fixed = amount.toFixed(2);
        const [intPart, decPart] = fixed.split('.');
        return {
          full: Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          int: Number(intPart).toLocaleString('en-US'),
          dec: decPart,
        };
      };

      const beforeVatParts = splitAmount(beforeVat);
      const vatParts = splitAmount(vatAmount);
      const totalVatParts = splitAmount(baseCost);

      const data: VehicleCardData = {
        header,
        stockNumber: stock.stockNumber || '-',
        date: formatThaiDate(new Date()),
        car: {
          brand: stock.vehicleModel?.brand || '-',
          model: stock.vehicleModel?.model || '-',
          variant: stock.vehicleModel?.variant || '',
          year: stock.vehicleModel?.year?.toString() || '-',
          color: stock.exteriorColor || '-',
          interiorColor: stock.interiorColor || '-',
          engineNo: stock.engineNumber || '-',
          chassisNo: stock.vin || '-',
          ccOrKw: '-',
        },
        costs: {
          baseCost: baseCost.toString(),
          beforeVat: beforeVatParts.full,
          beforeVatInt: beforeVatParts.int,
          beforeVatDec: beforeVatParts.dec,
          vatAmount: vatParts.full,
          vatAmountInt: vatParts.int,
          vatAmountDec: vatParts.dec,
          totalWithVat: totalVatParts.full,
          totalWithVatInt: totalVatParts.int,
          totalWithVatDec: totalVatParts.dec,
          transportCost: transportCost.toString(),
          accessoryCost: accessoryCost.toString(),
          otherCosts: otherCosts.toString(),
          totalCost: totalCost.toString(),
        },
        location: stock.parkingSlot || '-',
      };

      const pdfBuffer = await pdfService.generateVehicleCardTemplate(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="vehicle-card-template-${stock.vin}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_CAR_DETAIL_CARD')],
      params: t.Object({
        stockId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Vehicle Card Template PDF',
        description: 'Generate การ์ดรายละเอียดรถยนต์ PDF (แบบไม่มีกรอบ) for a stock',
      },
    }
  )

  /**
   * Generate Temporary Receipt PDF (ใบรับเงินชั่วคราว)
   */
  .get(
    '/temporary-receipt/:paymentId',
    async ({ params, set }) => {
      const payment = await db.payment.findUnique({
        where: { id: params.paymentId },
        include: {
          customer: true,
          sale: {
            include: {
              customer: true,
              stock: {
                include: {
                  vehicleModel: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        set.status = 404;
        return { success: false, error: 'Payment not found' };
      }

      const sale = payment.sale;
      const customer = payment.customer || sale?.customer;

      // Build items: payment type label as main item, description as sub-item
      const typeLabel = PAYMENT_TYPE_LABELS[payment.paymentType as keyof typeof PAYMENT_TYPE_LABELS] || 'ค่าชำระเงิน';
      const carName = sale?.stock?.vehicleModel ? `${sale.stock.vehicleModel.brand} ${sale.stock.vehicleModel.model}` : '';
      const methodLabel = PAYMENT_METHOD_LABELS[payment.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || '';
      const mainItem = `${typeLabel}${carName ? ` - ${carName}` : ''}`;
      const items: { description: string; amount: string }[] = [
        { description: mainItem, amount: payment.amount.toString() },
      ];
      if (payment.description) {
        items.push({ description: payment.description, amount: '' });
      }

      // Determine payment method
      const paymentMethodData = {
        isCash: payment.paymentMethod === 'CASH',
        isCheque: payment.paymentMethod === 'CHEQUE',
        isTransfer: payment.paymentMethod === 'BANK_TRANSFER',
        bankName: payment.receivingBank || '',
        branchName: '',
        accountNumber: '',
        transferAmount: payment.paymentMethod === 'BANK_TRANSFER' ? payment.amount.toString() : '',
      };

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: TemporaryReceiptData = {
        header: {
          ...header,
          fax: '',
        },
        customerCode: customer?.code || '',
        receiptNumber: payment.receiptNumber,
        date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
        contractNumber: sale?.saleNumber || '',
        customer: transformCustomer(customer),
        items,
        paymentAmount: payment.amount.toString(),
        lateFee: '0',
        discount: '0',
        totalAmount: payment.amount.toString(),
        totalAmountText: numberToThaiText(Number(payment.amount)),
        paymentMethod: paymentMethodData,
        paymentMethodLabel: methodLabel,
        note: payment.notes || undefined,
      };

      const pdfBuffer = await pdfService.generateTemporaryReceipt(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="temporary-receipt-${payment.receiptNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        paymentId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Temporary Receipt PDF',
        description: 'Generate ใบรับเงินชั่วคราว PDF for a payment',
      },
    }
  )

  /**
   * Generate Temporary Receipt PDF (ใบรับเงินชั่วคราว - แบบมีพื้นหลัง)
   */
  .get(
    '/temporary-receipt-bg/:paymentId',
    async ({ params, set }) => {
      const payment = await db.payment.findUnique({
        where: { id: params.paymentId },
        include: {
          customer: true,
          sale: {
            include: {
              customer: true,
              stock: {
                include: {
                  vehicleModel: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        set.status = 404;
        return { success: false, error: 'Payment not found' };
      }

      const sale = payment.sale;
      const customer = payment.customer || sale?.customer;

      // Build items: payment type label as main item, description as sub-item
      const typeLabel = PAYMENT_TYPE_LABELS[payment.paymentType as keyof typeof PAYMENT_TYPE_LABELS] || 'ค่าชำระเงิน';
      const carName = sale?.stock?.vehicleModel ? `${sale.stock.vehicleModel.brand} ${sale.stock.vehicleModel.model}` : '';
      const methodLabel = PAYMENT_METHOD_LABELS[payment.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || '';
      const mainItem = `${typeLabel}${carName ? ` - ${carName}` : ''}`;
      const items: { description: string; amount: string }[] = [
        { description: mainItem, amount: payment.amount.toString() },
      ];
      if (payment.description) {
        items.push({ description: payment.description, amount: '' });
      }

      // Determine payment method
      const paymentMethodData = {
        isCash: payment.paymentMethod === 'CASH',
        isCheque: payment.paymentMethod === 'CHEQUE',
        isTransfer: payment.paymentMethod === 'BANK_TRANSFER',
        bankName: payment.receivingBank || '',
        branchName: '',
        accountNumber: '',
        transferAmount: payment.paymentMethod === 'BANK_TRANSFER' ? payment.amount.toString() : '',
      };

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: TemporaryReceiptData = {
        header: {
          ...header,
          fax: '',
        },
        customerCode: customer?.code || '',
        receiptNumber: payment.receiptNumber,
        date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
        contractNumber: sale?.saleNumber || '',
        customer: transformCustomer(customer),
        items,
        paymentAmount: payment.amount.toString(),
        lateFee: '0',
        discount: '0',
        totalAmount: payment.amount.toString(),
        totalAmountText: numberToThaiText(Number(payment.amount)),
        paymentMethod: paymentMethodData,
        paymentMethodLabel: methodLabel,
        note: payment.notes || undefined,
      };

      const pdfBuffer = await pdfService.generateTemporaryReceiptBg(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="temporary-receipt-bg-${payment.receiptNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        paymentId: t.String(),
      }),
      detail: {
        tags: ['PDF'],
        summary: 'Generate Temporary Receipt PDF with Background',
        description: 'Generate ใบรับเงินชั่วคราว PDF (แบบมีพื้นหลัง) for a payment',
      },
    }
  )

  /**
   * Generate Daily Payment Report PDF
   */
  .get(
    '/daily-payment-report/:date',
    async ({ params, set }) => {
      const date = new Date(params.date);
      // Single-day window: [start of day, start of next day)
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      const dailyPaymentReport = await db.payment.findMany({
        where: {
          paymentDate: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
        include: {
          customer: true,
          sale: {
            include: {
              customer: true,
              stock: {
                include: {
                  vehicleModel: true,
                },
              },
            },
          },
        },
        orderBy: {
          paymentDate: 'asc',
        },
      });

      // Calculate summary
      const totalAmount = dailyPaymentReport.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalCount = dailyPaymentReport.length;

      // Map payments
      const mappedPayments = dailyPaymentReport.map((p) => ({
        paymentDate: p.paymentDate,
        receiptNumber: p.receiptNumber,
        invoiceNumber: p.receiptNumber, // Often matches document number
        customerName: p.customer?.name || p.sale?.customer?.name || 'ลูกค้าทั่วไป',
        amount: Number(p.amount),
        paymentType: p.paymentType,
        paymentMethod: p.paymentMethod,
      }));

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: DailyPaymentReportData = {
        header,
        dateRange: `${formatThaiDate(date)} ถึง ${formatThaiDate(date)}`,
        payments: mappedPayments,
        summary: {
          totalAmount: totalAmount,
          totalCount: totalCount,
          byMethod: [],
          byType: [],
        },
      };

      const pdfBuffer = await pdfService.generateDailyPaymentReport(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `inline; filename="daily-payment-report-${date.toISOString().slice(0, 10)}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('REPORT_FINANCE')],
      params: t.Object({
        date: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Daily Payment Report PDF',
        description: 'Generate ใบบันทึกการชำระเงินรายวัน PDF',
      },
    }
  )
  // Daily Stock Snapshot PDF
  .get(
    '/daily-stock-snapshot',
    async ({ query, set }) => {
      const date = new Date(query.date);
      if (Number.isNaN(date.getTime())) {
        set.status = 400;
        return 'Invalid date';
      }
      const report = await reportsService.getDailyStockSnapshot({ date });
      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const panels = [
        {
          title: 'ยอดจองคงเหลือ',
          rows: report.models.map((m) => ({
            modelName: m.modelName,
            cells: report.colors.map((c) => m.reservationsByColor[c] || 0),
            total: m.reservationsTotal,
          })),
        },
        {
          title: 'สต๊อกคงเหลือ',
          rows: report.models.map((m) => ({
            modelName: m.modelName,
            cells: report.colors.map((c) => m.availableByColor[c] || 0),
            total: m.availableTotal,
          })),
        },
        {
          title: 'ยอดที่ต้องสั่งซื้อ',
          rows: report.models.map((m) => ({
            modelName: m.modelName,
            cells: report.colors.map((c) => m.requiredByColor[c] || 0),
            total: m.requiredTotal,
          })),
        },
      ];

      const pdfBuffer = await pdfService.generateDailyStockSnapshotPdf({
        header,
        date: report.date,
        colors: report.colors,
        panels,
      });
      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="daily-stock-snapshot-${report.date}.pdf"`;
      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('REPORT_STOCK')],
      query: t.Object({ date: t.String() }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Daily Stock Snapshot PDF',
      },
    },
  )
  // Monthly Purchases Report PDF
  .get(
    '/monthly-purchases',
    async ({ query, set }) => {
      const year = Number(query.year);
      const month = Number(query.month);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        set.status = 400;
        return 'Invalid year/month';
      }
      const report = await reportsService.getMonthlyPurchasesReport({
        year,
        month,
        vehicleType: query.vehicleType as any,
      });
      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const items = report.items.map((i) => ({
        ...i,
        orderDate: i.orderDate ? i.orderDate.split('T')[0] : '-',
        arrivalDate: i.arrivalDate.split('T')[0],
      }));

      const pdfBuffer = await pdfService.generateMonthlyPurchasesReportPdf({
        header,
        period: report.period,
        items,
        summary: report.summary,
      });
      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="monthly-purchases-${year}-${String(month).padStart(2, '0')}.pdf"`;
      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('REPORT_STOCK')],
      query: t.Object({
        year: t.String(),
        month: t.String(),
        vehicleType: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Monthly Purchases Report PDF',
      },
    },
  );
