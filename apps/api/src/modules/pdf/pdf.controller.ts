/**
 * PDF Controller
 * API endpoints for PDF generation
 */

import { Elysia, t } from 'elysia';
import { pdfService } from './pdf.service';
import { authMiddleware } from '../auth/auth.middleware';
import { db } from '../../lib/db';
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
import { formatThaiDate } from './helpers';

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

export const pdfRoutes = new Elysia({ prefix: '/pdf' })
  /**
   * Generate Delivery Receipt PDF (ใบปล่อยรถ/ใบรับรถ)
   */
  .get(
    '/delivery-receipt/:saleId',
    async ({ params, set }) => {
      try {
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

        const data: DeliveryReceiptData = {
          header: {
            logoBase64: '',
            companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
            address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
            address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
            phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
          },
          customer: transformCustomer(sale.customer),
          car: transformCar(sale.stock),
          deliveryDate: sale.deliveryDate ? formatThaiDate(sale.deliveryDate) : undefined,
        };

        

        const pdfBuffer = await pdfService.generateDeliveryReceipt(data);

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="delivery-receipt-${sale.saleNumber}.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to generate PDF',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
      try {
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

        const data: ThankYouLetterData = {
          header: {
            logoBase64: '',
            companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
            address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
            address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
            phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
          },
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
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to generate PDF',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
      try {
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

        const data: SalesConfirmationData = {
          header: {
            logoBase64: '',
            companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
            address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
            address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
            phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
          },
          createdDate: sale.createdAt.toISOString(),
          car: transformCar(sale.stock),
          customer: transformCustomer(sale.customer),
          paymentMethod: sale.paymentMode === 'CASH' ? 'เงินสด' : sale.paymentMode === 'FINANCE' ? 'บริษัทไฟแนนซ์' : sale.paymentMode,
        };

        const pdfBuffer = await pdfService.generateSalesConfirmation(data);

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="sales-confirmation-${sale.saleNumber}.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to generate PDF',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
      try {
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

        const data: SalesRecordData = {
          header: {
            logoBase64: '',
            companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
            address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
            address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
            phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
          },
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
            salesConsultant: sale.createdBy?.displayName || sale.createdBy?.username || '-',
            salesManager: '-',
            auditor: '-',
          },
        };

        const pdfBuffer = await pdfService.generateSalesRecord(data);

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="sales-record-${sale.saleNumber}.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to generate PDF',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
      try {
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

        console.log(sale);

        if (!sale) {
          set.status = 404;
          return { success: false, error: 'Sale not found' };
        }

        const car = transformCar(sale.stock);

        // Get reservation payment (first payment)
        const reservationPayment = sale.payments && sale.payments.length > 0 ? sale.payments[0] : null;

        const data: any = { // Using any to bypass strict type check for now to support the template
          header: {
            logoBase64: '',
            companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
            address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
            address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
            phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
          },
          documentInfo: {
            volumeNumber: '1',
            documentNumber: sale.saleNumber,
            contractLocation: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
            salesManagerName: '', // Placeholder, no data available on sale object
            salesManagerPhone: '',
            salesStaffName: sale.createdBy?.displayName || sale.createdBy?.username || '-',
            salesStaffPhone: sale.createdBy?.phoneNumber || '-',
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

        console.log(data);

        const pdfBuffer = await pdfService.generateContract(data);

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="contract-${sale.saleNumber}.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to generate PDF',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
      try {
        const payment = await db.payment.findUnique({
          where: { id: params.paymentId },
          include: {
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

        const data: DepositReceiptData = {
          header: {
            logoBase64: '',
            companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
            address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
            address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
            phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
          },
          receiptNumber: payment.receiptNumber,
          date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
          customer: transformCustomer(sale?.customer),
          car: transformCar(sale?.stock),
          depositAmount: payment.amount.toString(),
          depositAmountText: '', // Will be calculated by the template helper
          paymentMethod: payment.paymentMethod || 'CASH',
          note: payment.notes || undefined,
        };

        const pdfBuffer = await pdfService.generateDepositReceipt(data);

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="deposit-receipt-${payment.receiptNumber}.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to generate PDF',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
      try {
        const payment = await db.payment.findUnique({
          where: { id: params.paymentId },
          include: {
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

        const data: PaymentReceiptData = {
          header: {
            logoBase64: '',
            companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
            address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
            address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
            phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
          },
          receiptNumber: payment.receiptNumber,
          date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
          customer: transformCustomer(sale?.customer),
          car: transformCar(sale?.stock),
          amount: payment.amount.toString(),
          amountText: '', // Will be calculated by the template helper
          paymentMethod: payment.paymentMethod || 'CASH',
          note: payment.notes || undefined,
        };

        const pdfBuffer = await pdfService.generatePaymentReceipt(data);

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="payment-receipt-${payment.receiptNumber}.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to generate PDF',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
      try {
        const stock = await db.stock.findUnique({
          where: { id: params.stockId },
          include: {
            vehicleModel: true,
          },
        });

        if (!stock) {
          set.status = 404;
          return { success: false, error: 'Stock not found' };
        }

        const data: VehicleCardData = {
          header: {
            logoBase64: '',
            companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
            address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
            address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
            phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
          },
          stockNumber: stock.vin || '-',
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
            ccOrKw: '-', // Not in stock model
          },
          costs: {
            baseCost: stock.baseCost.toString(),
            transportCost: stock.transportCost.toString(),
            accessoryCost: stock.accessoryCost.toString(),
            otherCosts: stock.otherCosts.toString(),
            totalCost: stock.baseCost
              .plus(stock.transportCost)
              .plus(stock.accessoryCost)
              .plus(stock.otherCosts)
              .plus(stock.accumulatedInterest)
              .toString(),
          },
          location: stock.parkingSlot || '-',
        };

        const pdfBuffer = await pdfService.generateVehicleCard(data);

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="vehicle-card-${stock.vin}.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to generate PDF',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
   * Generate Temporary Receipt PDF (ใบรับเงินชั่วคราว)
   */
  .get(
    '/temporary-receipt/:paymentId',
    async ({ params, set }) => {
      try {
        const payment = await db.payment.findUnique({
          where: { id: params.paymentId },
          include: {
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
        const customer = sale?.customer;

        // Build items array from payment description or default
        const items = [
          {
            description: payment.notes || `ค่าจอง ${sale?.stock?.vehicleModel?.brand || ''} ${sale?.stock?.vehicleModel?.model || ''}`,
            amount: payment.amount.toString(),
          },
        ];

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

        const data: TemporaryReceiptData = {
          header: {
            logoBase64: '',
            companyName: 'บริษัท สยามเค มาสเตอร์เซลส์ จำกัด',
            address1: '438 หนองคาย 288 Thanon Mittraphap, ในเมือง เมือง Nakhon Ratchasima 30000',
            address2: '',
            phone: '044-272888, 271178, 271169. 271851',
            fax: '044-271224',
          },
          customerCode: customer?.code || '',
          receiptNumber: payment.receiptNumber,
          date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
          contractNumber: sale?.saleNumber || '',
          customer: transformCustomer(customer),
          items,
          // Totals section
          paymentAmount: payment.amount.toString(),
          lateFee: '0',
          discount: '0',
          totalAmount: payment.amount.toString(),
          totalAmountText: '', // Will be calculated by helper
          paymentMethod: paymentMethodData,
          note: payment.notes || undefined,
        };

        const pdfBuffer = await pdfService.generateTemporaryReceipt(data);

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `attachment; filename="temporary-receipt-${payment.receiptNumber}.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF generation error:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to generate PDF',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      beforeHandle: authMiddleware,
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
   * Preview PDF without authentication (for testing only - remove in production)
   */
  .get(
    '/preview/:type',
    async ({ params, set }) => {
      try {
        // Sample data for preview
        const sampleCustomer: CustomerInfo = {
          name: 'นายทดสอบ ระบบ',
          address: '123/456',
          street: 'ถนนทดสอบ',
          subdistrict: 'ในเมือง',
          district: 'เมือง',
          province: 'นครราชสีมา',
          postalCode: '30000',
          phone: '0812345678',
        };

        const sampleCar: CarInfo = {
          brand: 'Tesla',
          model: 'Model 3',
          engineNo: 'ENG123456',
          chassisNo: 'CHS789012',
          color: 'ขาว',
          type: 'รถยนต์ไฟฟ้า',
        };

        let pdfBuffer: Buffer;

        const sampleHeader = {
          logoBase64: '',
          companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
          address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
          address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
          phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
        };

        switch (params.type) {
          case 'delivery-receipt':
            pdfBuffer = await pdfService.generateDeliveryReceipt({
              header: sampleHeader,
              customer: sampleCustomer,
              car: sampleCar,
            });
            break;

          case 'thank-you-letter':
            pdfBuffer = await pdfService.generateThankYouLetter({
              header: sampleHeader,
              thaiDate: formatThaiDate(new Date(), 'full'),
              customerName: sampleCustomer.name,
              carBrand: sampleCar.brand,
              detailsTable: {
                sellingPrice: '890000',
                discount: '50000',
                remaining: '840000',
                downPayment: '100000',
                downPaymentDiscount: '0',
                insurance: '15000',
                actInsurance: '2500',
                registrationFee: '3000',
                totalDelivery: '120500',
                financeAmount: '740000',
                interestRate: '3.5',
                installmentMonths: '60',
                monthlyPayment: '14500',
                gifts: [{ name: 'ฟิล์มกรองแสง' }, { name: 'กล้องหน้าหลัง' }],
              },
              contactPerson: {
                name: 'นายณัฐนันท์ คมฤทัย',
                phone: 'โทร.(044) 272888, 094-978-9926',
                position: 'ฝ่ายตรวจสอบ',
              },
            });
            break;

          case 'sales-confirmation':
            pdfBuffer = await pdfService.generateSalesConfirmation({
              header: sampleHeader,
              createdDate: new Date().toISOString(),
              car: sampleCar,
              customer: sampleCustomer,
              paymentMethod: 'เงินสด',
            });
            break;

          case 'sales-record':
            pdfBuffer = await pdfService.generateSalesRecord({
              header: sampleHeader,
              customer: sampleCustomer,
              car: sampleCar,
              pricing: {
                sellingPrice: '890,000',
                remaining: '800,000',
                downPayment: '90,000',
                downPaymentDiscount: '0',
                insurance: '15,000',
                actInsurance: '1,500',
                registrationFee: '2,500',
                totalDelivery: '109,000',
                financeAmount: '800,000',
                deductDeposit: '10,000',
                deliveryAmount: '99,000',
                outstandingBalance: '0',
                paymentDueDate: '15/12/2568',
                financeCompany: 'ธนาคารกสิกรไทย',
                interestRate: '2.5',
                installmentMonths: '60',
                monthlyPayment: '15,000',
              },
              gifts: [
                { item: 'ฟิล์มกรองแสง', value: '5,000' },
                { item: 'กล้องติดรถ', value: '3,000' },
              ],
              staff: {
                salesConsultant: 'นายขาย ดี',
                salesManager: 'นายผู้จัดการ ฝ่ายขาย',
                auditor: 'นายตรวจสอบ เอกสาร',
              },
            });
            break;

          case 'payment-receipt':
            pdfBuffer = await pdfService.generatePaymentReceipt({
              header: sampleHeader,
              receiptNumber: 'RCP-2024001',
              date: new Date().toISOString(),
              customer: sampleCustomer,
              car: sampleCar,
              amount: '50,000',
              amountText: '', // calculated
              paymentMethod: 'เงินสด',
              note: 'ชำระค่างวดที่ 1',
            });
            break;

          case 'contract':
            pdfBuffer = await pdfService.generateContract({
              header: sampleHeader,
              documentInfo: {
                volumeNumber: '1',
                documentNumber: '0001',
                contractLocation: 'นครราชสีมา',
                contractDay: '7',
                contractMonth: 'ธันวาคม',
                contractYear: '2568',
                salesManagerName: 'นายผู้จัดการ ฝ่ายขาย',
                salesManagerPhone: '081-234-5678',
                salesStaffName: 'นายพนักงาน ขาย',
                salesStaffPhone: '089-876-5432',
              },
              parties: {
                companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น',
                dealerName: 'VBeyond Innovation',
                isHeadOffice: true,
                isBranchOffice: false,
                branchLocation: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
                companyPhone: '044-272-888',
                companyEmail: 'info@vbeyond.co.th',
                authorizedPerson: 'นายผู้มีอำนาจ ลงนาม',
                authorizedDate: '1',
                authorizedMonth: 'มกราคม',
                authorizedYear: '2568',
                customerName: 'นายทดสอบ ระบบ',
                customerIdCard: '1-2345-67890-12-3',
                customerAddress: '123/456 ถนนทดสอบ ตำบลในเมือง อำเภอเมือง จังหวัดนครราชสีมา 30000',
                customerOfficePhone: '044-123-456',
                customerHomePhone: '044-789-012',
                customerMobile: '081-234-5678',
                customerEmail: 'test@email.com',
              },
              vehicleDetails: {
                type: 'รถยนต์ไฟฟ้า',
                brand: 'Tesla',
                model: 'Model 3',
                color: 'ขาว',
                mfy: '2024',
                engineCCOrKW: '283 kW',
                batteryType: 'Lithium-ion',
                batteryCapacity: '60 kWh',
                nedcRange: '491',
                bookingDepositDate: '7 ธันวาคม 2568',
              },
              pricing: {
                priceExcludeVAT: '831,775.70',
                priceIncludeVAT: '890,000.00',
              },
              freeAccessories: ['ฟิล์มกรองแสง 3M', 'กล้องติดรถ', 'พรมปูพื้น'],
              reservationFee: {
                isCash: true,
                amount: '10,000',
              },
              additionalAccessories: [],
              primaryExpenses: {
                carPrice: '890,000',
                downPayment: '90,000',
                registrationFee: '2,500',
                redPlateFee: '1,000',
                insurancePremium: '15,000',
                accessoryFee: '0',
                otherFee: '0',
                totalExpense: '998,500',
                reservationFee: '10,000',
                usedCarTradeIn: '0',
                otherDiscount: '0',
                netTotalExpense: '988,500',
              },
              purchaseConditions: {
                isCash: false,
                isHirePurchase: true,
                financeCompany: 'ธนาคารกสิกรไทย',
                downPaymentPercent: '10',
                downPaymentAmount: '89,000',
                interestPercent: '2.5',
                isBeginning: false,
                isEnding: true,
                financeAmount: '800,000',
                installmentMonths: '60',
                monthlyPayment: '15,000',
              },
              insurance: {
                companyName: 'ทิพยประกันภัย',
                partNumber: '1',
                sumInsured: '890,000',
                specifyPremium: true,
                premiumAmount: '15,000',
                notSpecifyPremium: false,
                notSpecifyPremiumAmount: '',
              },
              delivery: {
                deliveryDate: '15 มกราคม 2569',
                deliveryLocation: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด สำนักงานใหญ่',
              },
            });
            break;

          case 'deposit-receipt':
            pdfBuffer = await pdfService.generateDepositReceipt({
              header: sampleHeader,
              receiptNumber: 'DEP-2568-0001',
              date: new Date().toISOString(),
              customer: sampleCustomer,
              vehicle: {
                model: 'Tesla Model 3',
                color: 'ขาว',
              },
              deposit: {
                amount: '10,000',
                amountInWords: 'หนึ่งหมื่นบาทถ้วน',
                paymentMethod: 'เงินสด',
                referenceNo: '-',
              },
            });
            break;

          default:
            set.status = 400;
            return { success: false, error: 'Invalid template type. Valid types: delivery-receipt, thank-you-letter, sales-confirmation, sales-record, contract, deposit-receipt' };
        }

        set.headers['Content-Type'] = 'application/pdf';
        set.headers['Content-Disposition'] = `inline; filename="preview-${params.type}.pdf"`;
        
        return pdfBuffer;
      } catch (error) {
        console.error('PDF preview error:', error);
        set.status = 500;
        return {
          success: false,
          error: 'Failed to generate PDF preview',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    {
      params: t.Object({
        type: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Preview PDF template',
        description: 'Preview a PDF template with sample data (for testing)',
      },
    }
  );
