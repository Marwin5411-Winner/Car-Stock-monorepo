import { describe, it, expect, mock } from 'bun:test';
import type { VehicleCardData, CompanyHeader } from '../modules/pdf/types';
import { PdfTemplateType } from '../modules/pdf/types';

// Mock settings to avoid DB dependency (same pattern as pdf.test.ts)
mock.module('../modules/settings/settings.service', () => ({
  settingsService: { getSettings: () => Promise.resolve(null) },
}));

const { pdfService } = await import('../modules/pdf/pdf.service');

const mockHeader: CompanyHeader = {
  logoBase64: '',
  companyName: 'Test Company',
  address1: '123 Test St',
  address2: 'Test City',
  phone: '000-000-0000',
};

const cardData: VehicleCardData = {
  header: mockHeader,
  stockNumber: 'STK-HTML-001',
  car: {
    brand: 'Toyota',
    model: 'Yaris Ativ',
    engineNo: 'ENG-HTML',
    chassisNo: 'CHS-HTML',
    color: 'แดง',
  },
  costs: {
    baseCost: '535000',
    beforeVat: '500,000.00',
    beforeVatInt: '500,000',
    beforeVatDec: '00',
    vatAmount: '35,000.00',
    vatAmountInt: '35,000',
    vatAmountDec: '00',
    totalWithVat: '535,000.00',
    totalWithVatInt: '535,000',
    totalWithVatDec: '00',
    transportCost: '0',
    accessoryCost: '0',
    otherCosts: '0',
    totalCost: '535000',
  },
} as VehicleCardData;

describe('Vehicle card HTML print', () => {
  it('renderVehicleCardHtml returns a full HTML doc sized to custom stock paper with card data', async () => {
    const html = await pdfService.renderVehicleCardHtml(cardData);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('@page');
    expect(html).toContain('26.9cm 20.9cm'); // custom cut stock (not Letter/A4)
    expect(html).toContain('STK-HTML-001'); // data rendered
    expect(html).toContain('การ์ดรายละเอียดรถยนต์'); // card title text present
  });

  it('renderVehicleCardTemplateHtml returns the frameless overlay HTML with @page', async () => {
    const html = await pdfService.renderVehicleCardTemplateHtml(cardData);
    expect(html).toContain('@page');
    expect(html).toContain('26.9cm 20.9cm');
    expect(html).toContain('STK-HTML-001');
  });

  it('renders cost values onto the frameless overlay so they land on the pre-printed form', async () => {
    const html = await pdfService.renderVehicleCardTemplateHtml(cardData);
    expect(html).toContain('500,000'); // ราคาก่อน VAT
    expect(html).toContain('35,000'); // VAT 7%
    expect(html).toContain('535,000'); // รวม
  });

  it('template overlay has data only — no form title, headings, or row labels', async () => {
    const html = await pdfService.renderVehicleCardTemplateHtml(cardData);
    // Values present
    expect(html).toContain('Yaris Ativ');
    expect(html).toContain('ENG-HTML');
    expect(html).toContain('CHS-HTML');
    // Form chrome absent
    expect(html).not.toContain('การ์ดรายละเอียดรถยนต์');
    expect(html).not.toContain('รายละเอียดต้นทุน');
    expect(html).not.toContain('ราคาขาย');
    expect(html).not.toContain('เงินสด');
    expect(html).not.toContain('เลขมอเตอร์');
    expect(html).not.toContain('ราคาก่อน VAT');
  });

  it('normal card still includes the full form title (overlay-only change)', async () => {
    const html = await pdfService.renderVehicleCardHtml(cardData);
    expect(html).toContain('การ์ดรายละเอียดรถยนต์');
    expect(html).toContain('รายละเอียดต้นทุน');
  });

  it('neutralizes the template print padding so the @page margin is the sole gap', async () => {
    const html = await pdfService.renderVehicleCardHtml(cardData);
    expect(html).toContain('html body .page'); // higher-specificity override present
    expect(html).toContain('page-break-after: auto'); // forced page-break cancelled to prevent trailing blank page
  });

  it('does NOT emit @page on the default PDF path (htmlPage opt-in gate is off by default)', async () => {
    // Locks the "PDF path byte-for-byte unchanged" guarantee mechanically:
    // calling renderHtml without an htmlPage option must never inject the
    // @page rule (the only place that string is emitted by our code), while
    // still producing a real render with the card data present.
    const html = await pdfService.renderHtml(PdfTemplateType.VEHICLE_CARD, cardData);
    expect(html).not.toContain('@page'); // opt-in gate off → no page-size rule injected
    expect(html).toContain('STK-HTML-001'); // still a real render
  });
});
