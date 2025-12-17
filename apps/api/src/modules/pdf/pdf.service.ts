/**
 * PDF Generation Service
 * Uses Puppeteer for HTML-to-PDF conversion with Handlebars templates
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import {
  PdfOptions,
  PdfTemplateType,
  DeliveryReceiptData,
  ThankYouLetterData,
  SalesConfirmationData,
  SalesRecordData,
  ContractData,
  CarReservationContractData,
  DepositReceiptData,
  PaymentReceiptData,
  VehicleCardData,
  TemporaryReceiptData,
  CompanyHeader,
} from './types';
import {
  formatThaiDate,
  formatThaiDateWithDay,
  formatCurrency,
  numberToThaiText,
  formatPhoneNumber,
  formatIdCard,
  getCurrentThaiDate,
  safeString,
  formatPercentage,
} from './helpers';

// Register Handlebars helpers
Handlebars.registerHelper('formatThaiDate', (date: string, format?: string) =>
  formatThaiDate(date, format as 'full' | 'short' | 'numeric')
);
Handlebars.registerHelper('formatThaiDateWithDay', (date: string) => formatThaiDateWithDay(date));
Handlebars.registerHelper('formatCurrency', (amount: number | string, showCurrency?: boolean) =>
  formatCurrency(amount, showCurrency !== false)
);
Handlebars.registerHelper('numberToThaiText', (num: number | string) => numberToThaiText(num));
Handlebars.registerHelper('formatPhone', (phone: string) => formatPhoneNumber(phone));
Handlebars.registerHelper('formatIdCard', (idCard: string) => formatIdCard(idCard));
Handlebars.registerHelper('currentThaiDate', () => getCurrentThaiDate());
Handlebars.registerHelper('safe', (value: string | null | undefined, defaultValue?: string) =>
  safeString(value, defaultValue)
);
Handlebars.registerHelper('formatPercentage', (value: number | string) => formatPercentage(value));
Handlebars.registerHelper('ifEquals', function (this: any, arg1: any, arg2: any, options: Handlebars.HelperOptions) {
  return arg1 === arg2 ? options.fn(this) : options.inverse(this);
});
Handlebars.registerHelper('add', (a: number, b: number) => a + b);
Handlebars.registerHelper('subtract', (a: number, b: number) => a - b);

// Default company header
const DEFAULT_COMPANY_HEADER: CompanyHeader = {
  logoBase64: '', // Will be loaded from file
  companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
  address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
  address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
  phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
};

export class PdfService {
  private static instance: PdfService;
  private browser: Browser | null = null;
  private templateCache: Map<string, Handlebars.TemplateDelegate> = new Map();
  private templatesDir: string;
  private fontsDir: string;
  private logoBase64: string = '';

  private constructor() {
    this.templatesDir = path.join(__dirname, 'templates');
    this.fontsDir = path.join(__dirname, 'fonts');
    this.loadLogo();
    this.registerPartials();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PdfService {
    if (!PdfService.instance) {
      PdfService.instance = new PdfService();
    }
    return PdfService.instance;
  }

  /**
   * Load company logo as base64
   */
  private loadLogo(): void {
    try {
      // Try multiple locations for the logo
      const possiblePaths = [
        path.join(__dirname, 'images', 'Logo_150x150.png'),
        path.join(__dirname, '..', '..', 'public', 'images', 'Logo_150x150.png'),
      ];

      for (const logoPath of possiblePaths) {
        if (fs.existsSync(logoPath)) {
          const logoData = fs.readFileSync(logoPath);
          this.logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`;
          console.log(`✅ Logo loaded from: ${logoPath}`);
          return;
        }
      }
      console.warn('⚠️ Logo not found in any location');
    } catch (error) {
      console.warn('⚠️ Error loading logo:', error);
    }
  }

  /**
   * Get the company logo as base64
   */
  public getLogoBase64(): string {
    return this.logoBase64;
  }

  /**
   * Register Handlebars partials (reusable template components)
   */
  private registerPartials(): void {
    const partialsDir = path.join(this.templatesDir, 'partials');
    
    if (fs.existsSync(partialsDir)) {
      const partialFiles = fs.readdirSync(partialsDir);
      
      for (const file of partialFiles) {
        if (file.endsWith('.hbs')) {
          const partialName = file.replace('.hbs', '');
          const partialContent = fs.readFileSync(path.join(partialsDir, file), 'utf-8');
          Handlebars.registerPartial(partialName, partialContent);
        }
      }
    }
  }

  /**
   * Get or launch browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.connected) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
      });
    }
    return this.browser;
  }

  /**
   * Load and compile template
   * Note: In development, templates are not cached to allow hot reloading
   */
  private getTemplate(templateType: PdfTemplateType): Handlebars.TemplateDelegate {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // In development, always reload templates and partials
    if (isDevelopment) {
      this.templateCache.clear();
      this.registerPartials(); // Reload partials
    }
    
    if (this.templateCache.has(templateType)) {
      return this.templateCache.get(templateType)!;
    }

    const templatePath = path.join(this.templatesDir, `${templateType}.hbs`);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateType}`);
    }

    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    const compiled = Handlebars.compile(templateContent);
    this.templateCache.set(templateType, compiled);
    
    return compiled;
  }

  /**
   * Get font CSS for embedding Kanit font
   */
  private getFontCss(): string {
    const regularFontPath = path.join(this.fontsDir, 'Kanit-Regular.ttf');
    const boldFontPath = path.join(this.fontsDir, 'Kanit-Bold.ttf');

    let fontCss = '';

    // Check if local fonts exist, otherwise use Google Fonts
    if (fs.existsSync(regularFontPath) && fs.existsSync(boldFontPath)) {
      const regularBase64 = fs.readFileSync(regularFontPath).toString('base64');
      const boldBase64 = fs.readFileSync(boldFontPath).toString('base64');

      fontCss = `
        @font-face {
          font-family: 'Kanit';
          src: url(data:font/truetype;base64,${regularBase64}) format('truetype');
          font-weight: normal;
          font-style: normal;
        }
        @font-face {
          font-family: 'Kanit';
          src: url(data:font/truetype;base64,${boldBase64}) format('truetype');
          font-weight: bold;
          font-style: normal;
        }
      `;
    } else {
      // Use Google Fonts as fallback
      fontCss = `
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap');
      `;
    }

    return fontCss;
  }

  /**
   * Generate base HTML structure with styles
   */
  private getBaseHtml(content: string, isLandscape: boolean = false): string {
    const fontCss = this.getFontCss();
    const width = isLandscape ? '297mm' : '210mm';
    const height = isLandscape ? '210mm' : '297mm';

    return `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    ${fontCss}
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Kanit', sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #000;
      background: #fff;
    }
    
    .page {
      width: ${width};
      min-height: ${height};
      padding: 10mm;
      margin: 0 auto;
      background: white;
    }
    
    /* Header styles */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 10px;
    }
    
    .header-logo img {
      max-width: 150px;
      height: auto;
    }
    
    .header-info {
      text-align: right;
    }
    
    .company-name {
      font-size: 15px;
      font-weight: bold;
      margin-bottom: 2px;
    }
    
    .header-line {
      height: 2px;
      background: #FF0000;
      margin: 5px 0;
    }
    
    .header-address {
      font-size: 10px;
      line-height: 1.6;
    }
    
    /* Document title */
    .document-title {
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      margin: 30px 0 20px;
    }
    
    /* Content sections */
    .section {
      margin-bottom: 15px;
    }
    
    .section-title {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #ccc;
    }
    
    /* Paragraph with indent */
    .indent {
      text-indent: 2em;
    }
    
    /* Table styles */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }
    
    th, td {
      border: 1px solid #888;
      padding: 8px;
      text-align: left;
      font-size: 13px;
    }
    
    th {
      background: #7f858a;
      color: white;
      font-weight: normal;
    }
    
    tr:nth-child(even) {
      background: #f5f5f5;
    }
    
    /* Signature section */
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 60px;
      padding-top: 20px;
    }
    
    .signature-box {
      text-align: center;
      width: 45%;
    }
    
    .signature-line {
      border-top: 1px dotted #000;
      margin: 30px auto 5px;
      width: 80%;
    }
    
    .signature-label {
      font-size: 13px;
    }
    
    /* Contact box */
    .contact-box {
      border: 1px solid #000;
      padding: 10px;
      display: inline-block;
      text-align: center;
      font-size: 13px;
      line-height: 1.5;
    }
    
    /* Right aligned text */
    .text-right {
      text-align: right;
    }
    
    .text-center {
      text-align: center;
    }
    
    /* Date display */
    .date-display {
      text-align: right;
      margin-bottom: 10px;
    }
    
    /* Form fields */
    .form-row {
      margin-bottom: 8px;
    }
    
    .form-label {
      font-weight: bold;
    }
    
    /* Two column layout */
    .two-columns {
      display: flex;
      gap: 20px;
    }
    
    .column {
      flex: 1;
    }
    
    /* Notes section */
    .notes {
      font-size: 12px;
      margin-top: 20px;
      padding: 10px;
      background: #f9f9f9;
      border-left: 3px solid #ccc;
    }
    
    .notes li {
      margin-bottom: 5px;
    }
    
    /* Staff signatures */
    .staff-signatures {
      text-align: right;
      margin-top: 30px;
      line-height: 1.8;
    }
    
    /* Print styles */
    @media print {
      .page {
        margin: 0;
        padding: 10mm;
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>
`;
  }

  /**
   * Generate PDF from template and data
   */
  public async generatePdf<T>(
    templateType: PdfTemplateType,
    data: T,
    options: PdfOptions = {}
  ): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Get and compile template
      const template = this.getTemplate(templateType);
      
      // Add company header to data if not present
      // Use service's logoBase64 unless explicitly provided in data
      const providedHeader = (data as any).header || {};
      const dataWithHeader = {
        ...data,
        header: {
          ...DEFAULT_COMPANY_HEADER,
          ...providedHeader,
          // Always use service's logo if no logo is provided or if it's empty
          logoBase64: providedHeader.logoBase64 || this.logoBase64,
        },
      };

      // Render template with data
      const content = template(dataWithHeader);
      const html = this.getBaseHtml(content, options.landscape);

      // Set content and wait for rendering
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      // Generate PDF
      const pdfOptions: any = {
        margin: options.margin || {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm',
        },
        landscape: options.landscape || false,
        printBackground: options.printBackground !== false,
        preferCSSPageSize: true,
      };

      // Use custom width/height if provided, otherwise use format
      if (options.width && options.height) {
        pdfOptions.width = options.width;
        pdfOptions.height = options.height;
      } else {
        pdfOptions.format = options.format || 'A4';
      }

      const pdfBuffer = await page.pdf(pdfOptions);

      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }

  /**
   * Generate Delivery Receipt PDF (ใบปล่อยรถ/ใบรับรถ)
   */
  public async generateDeliveryReceipt(data: DeliveryReceiptData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.DELIVERY_RECEIPT, data);
  }

  /**
   * Generate Thank You Letter PDF (หนังสือขอบคุณ)
   */
  public async generateThankYouLetter(data: ThankYouLetterData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.THANK_YOU_LETTER, data);
  }

  /**
   * Generate Sales Confirmation PDF (หนังสือยืนยันการซื้อ-ขาย)
   */
  public async generateSalesConfirmation(data: SalesConfirmationData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.SALES_CONFIRMATION, data);
  }

  /**
   * Generate Sales Record PDF (ใบบันทึกการขาย)
   */
  public async generateSalesRecord(data: SalesRecordData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.SALES_RECORD, data);
  }

  /**
   * Generate Contract PDF (สัญญาจองรถยนต์) - supports both legacy and new format
   */
  public async generateContract(data: ContractData | CarReservationContractData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.CONTRACT, data);
  }

  /**
   * Generate Deposit Receipt PDF (ใบรับเงินมัดจำ)
   */
  public async generateDepositReceipt(data: DepositReceiptData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.DEPOSIT_RECEIPT, data);
  }

  /**
   * Generate Payment Receipt PDF (ใบเสร็จรับเงิน)
   */
  public async generatePaymentReceipt(data: PaymentReceiptData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.PAYMENT_RECEIPT, data);
  }

  /**
   * Generate Vehicle Card PDF (การ์ดรายละเอียดรถยนต์)
   */
  public async generateVehicleCard(data: VehicleCardData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.VEHICLE_CARD, data, { landscape: true });
  }

  /**
   * Generate Temporary Receipt PDF (ใบรับเงินชั่วคราว) - Small Format 9x5.5 inch
   */
  public async generateTemporaryReceipt(data: TemporaryReceiptData): Promise<Buffer> {
    // Use custom small page size (9x5.5 inches)
    return this.generatePdf(PdfTemplateType.TEMPORARY_RECEIPT, data, {
      width: '9in',
      height: '5.5in',
      margin: {
        top: '5mm',
        right: '5mm',
        bottom: '5mm',
        left: '5mm',
      },
    });
  }

  /**
   * Close browser instance
   */
  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Clear template cache
   */
  public clearCache(): void {
    this.templateCache.clear();
    this.registerPartials();
  }
}

// Export singleton instance
export const pdfService = PdfService.getInstance();
