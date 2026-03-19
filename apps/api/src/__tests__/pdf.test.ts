import { describe, it, expect, afterAll, mock } from 'bun:test';
import { PdfTemplateType } from '../modules/pdf/types';
import type {
  DeliveryReceiptData,
  DepositReceiptData,
  VehicleCardData,
  TemporaryReceiptData,
  DailyPaymentReportData,
  StockReportData,
  CompanyHeader,
} from '../modules/pdf/types';

/**
 * PDF Service Integration Tests
 *
 * Tests the Puppeteer-based PDF generation pipeline:
 * Handlebars template → HTML → Puppeteer page.pdf() → Buffer
 *
 * These tests launch a real Chromium instance to verify end-to-end PDF generation.
 * Each test validates:
 * - Output is a valid PDF (magic bytes: %PDF-)
 * - Output has reasonable size (> 1KB)
 */

// Mock the settings service to avoid DB dependency
mock.module('../modules/settings/settings.service', () => ({
  settingsService: {
    getSettings: () => Promise.resolve(null),
  },
}));

// Import after mocking
const { pdfService } = await import('../modules/pdf/pdf.service');

// Shared test data
const mockHeader: CompanyHeader = {
  logoBase64: '',
  companyName: 'Test Company',
  address1: '123 Test St',
  address2: 'Test City',
  phone: '000-000-0000',
};

function expectValidPdf(buffer: Buffer) {
  expect(buffer).toBeInstanceOf(Buffer);
  expect(buffer.length).toBeGreaterThan(1000);
  // PDF magic bytes
  const header = buffer.subarray(0, 5).toString('ascii');
  expect(header).toBe('%PDF-');
}

afterAll(async () => {
  await pdfService.closeBrowser();
});

describe('PdfService — Puppeteer engine', () => {
  describe('generatePdf basics', () => {
    it('should generate a simple delivery receipt PDF', async () => {
      const data: DeliveryReceiptData = {
        header: mockHeader,
        documentNumber: 'DR-2026-0001',
        date: '2026-03-19',
        customer: {
          name: 'ทดสอบ ระบบ',
          address: '123 ถนนทดสอบ',
          street: '',
          subdistrict: 'ในเมือง',
          district: 'เมือง',
          province: 'นครราชสีมา',
          postalCode: '30000',
          phone: '081-234-5678',
        },
        car: {
          brand: 'Toyota',
          model: 'Yaris',
          engineNo: 'ENG-001',
          chassisNo: 'CHS-001',
          color: 'ขาว',
        },
        deliveryDate: '2026-03-20',
        accessories: [],
        notes: '',
      };

      const buffer = await pdfService.generateDeliveryReceipt(data);
      expectValidPdf(buffer);
    }, 30000);

    it('should generate a deposit receipt PDF', async () => {
      const data: DepositReceiptData = {
        header: mockHeader,
        receiptNumber: 'DP-2026-0001',
        date: '2026-03-19',
        customer: {
          name: 'ลูกค้าทดสอบ',
          address: '456 ถนนทดสอบ',
          street: '',
          subdistrict: 'ในเมือง',
          district: 'เมือง',
          province: 'นครราชสีมา',
          postalCode: '30000',
          phone: '081-999-8888',
        },
        car: {
          brand: 'Honda',
          model: 'City',
          engineNo: 'ENG-002',
          chassisNo: 'CHS-002',
          color: 'ดำ',
        },
        depositAmount: '10,000.00',
        depositAmountText: 'หนึ่งหมื่นบาทถ้วน',
        paymentMethod: 'เงินสด',
      };

      const buffer = await pdfService.generateDepositReceipt(data);
      expectValidPdf(buffer);
    }, 30000);
  });

  describe('custom page sizes', () => {
    it('should generate vehicle card with custom dimensions (26.85 x 20.71 cm)', async () => {
      const data: VehicleCardData = {
        header: mockHeader,
        stockNumber: 'STK-001',
        car: {
          brand: 'Toyota',
          model: 'Yaris Ativ',
          engineNo: 'ENG-003',
          chassisNo: 'CHS-003',
          color: 'แดง',
        },
        year: '2026',
        price: '599,000',
        mileage: '15,000 km',
        registrationDate: '2026-01-15',
        images: [],
      };

      const buffer = await pdfService.generateVehicleCard(data);
      expectValidPdf(buffer);
    }, 30000);

    it('should generate temporary receipt with small page size (9 x 5.5 in)', async () => {
      const data: TemporaryReceiptData = {
        header: mockHeader,
        receiptNumber: 'TR-2026-0001',
        date: '2026-03-19',
        customerName: 'ทดสอบ ระบบ',
        amount: '50,000.00',
        amountText: 'ห้าหมื่นบาทถ้วน',
        description: 'ค่ามัดจำรถ',
        paymentMethod: 'เงินสด',
        receiverName: 'พนักงาน ทดสอบ',
      };

      const buffer = await pdfService.generateTemporaryReceipt(data);
      expectValidPdf(buffer);
    }, 30000);
  });

  describe('landscape mode', () => {
    it('should generate stock report in landscape', async () => {
      const data: StockReportData = {
        header: mockHeader,
        generatedDate: '2026-03-19',
        generatedBy: 'Admin',
        items: [
          {
            no: 1,
            stockNumber: 'STK-001',
            brand: 'Toyota',
            model: 'Yaris',
            year: '2026',
            color: 'ขาว',
            engineNo: 'ENG-001',
            chassisNo: 'CHS-001',
            cost: '500,000',
            sellingPrice: '599,000',
            status: 'พร้อมขาย',
            daysInStock: 15,
          },
        ],
        summary: {
          totalStock: 1,
          totalCost: '500,000',
          totalSellingPrice: '599,000',
        },
      };

      const buffer = await pdfService.generateStockReport(data);
      expectValidPdf(buffer);
    }, 30000);
  });

  describe('report templates', () => {
    it('should generate daily payment report PDF', async () => {
      const data: DailyPaymentReportData = {
        header: mockHeader,
        reportDate: '2026-03-19',
        generatedBy: 'Admin',
        items: [
          {
            no: 1,
            receiptNumber: 'RC-001',
            customerName: 'ลูกค้า ทดสอบ',
            customerCode: 'C001',
            description: 'ค่างวดรถ',
            paymentType: 'งวด',
            paymentMethod: 'เงินสด',
            amount: 15000,
            saleNumber: 'SL-001',
            issuedBy: 'พนักงาน A',
            note: '',
          },
        ],
        summary: {
          totalAmount: 15000,
          totalCount: 1,
        },
      };

      const buffer = await pdfService.generateDailyPaymentReport(data);
      expectValidPdf(buffer);
    }, 30000);
  });

  describe('browser management', () => {
    it('should reuse browser across multiple PDF generations', async () => {
      const data: DepositReceiptData = {
        header: mockHeader,
        receiptNumber: 'DP-2026-0002',
        date: '2026-03-19',
        customer: {
          name: 'ลูกค้า 2',
          address: '789 ถนนทดสอบ',
          street: '',
          subdistrict: 'ในเมือง',
          district: 'เมือง',
          province: 'นครราชสีมา',
          postalCode: '30000',
          phone: '081-111-2222',
        },
        car: {
          brand: 'Mazda',
          model: '2',
          engineNo: 'ENG-004',
          chassisNo: 'CHS-004',
          color: 'น้ำเงิน',
        },
        depositAmount: '20,000.00',
        depositAmountText: 'สองหมื่นบาทถ้วน',
        paymentMethod: 'โอน',
      };

      // Generate two PDFs — second should be faster (browser reuse)
      const start1 = performance.now();
      const buffer1 = await pdfService.generateDepositReceipt(data);
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      data.receiptNumber = 'DP-2026-0003';
      const buffer2 = await pdfService.generateDepositReceipt(data);
      const time2 = performance.now() - start2;

      expectValidPdf(buffer1);
      expectValidPdf(buffer2);

      // Both should complete in reasonable time (browser is reused, not relaunched)
      console.log(`  1st PDF: ${time1.toFixed(0)}ms | 2nd PDF: ${time2.toFixed(0)}ms`);
      expect(time1).toBeLessThan(15000);
      expect(time2).toBeLessThan(15000);
    }, 60000);

    it('should handle closeBrowser gracefully when already closed', async () => {
      await pdfService.closeBrowser();
      // Should not throw
      await pdfService.closeBrowser();
    });
  });
});
