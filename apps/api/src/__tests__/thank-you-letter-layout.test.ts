import { describe, expect, test } from 'bun:test';
import Handlebars from 'handlebars';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const templatePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../modules/pdf/templates/thank-you-letter.hbs',
);

const source = readFileSync(templatePath, 'utf-8');

describe('thank-you letter layout — CARSTOCK01-19 footer clip', () => {
  test('declares A4 with no extra @page margin (Letter-default Chromium was clipping the footer)', () => {
    expect(source).toMatch(/@page\s*\{[^}]*size:\s*A4/s);
    expect(source).toMatch(/@page\s*\{[^}]*margin:\s*0/s);
  });

  test('does not force a trailing blank page after the letter', () => {
    expect(source).toMatch(/page-break-after:\s*auto/);
  });

  test('keeps ฝ่ายตรวจสอบ + signature as one unbreakable footer block', () => {
    expect(source).toContain('ty-footer');
    expect(source).toMatch(/\.ty-footer[\s\S]*?page-break-inside:\s*avoid/);
    const footerChunk = source.slice(source.indexOf('ty-footer'));
    expect(footerChunk).toContain('contact-box');
    expect(footerChunk).toContain('signature-box');
  });

  test('does not use the 40px + 50px footer stack that overflowed the page', () => {
    expect(source).not.toMatch(/margin-top:\s*40px/);
    expect(source).not.toMatch(/margin-top:\s*50px/);
  });

  test('renders 12 gifts plus the footer block for both company names', () => {
    Handlebars.registerHelper('formatCurrency', (v: string) => v);
    Handlebars.registerHelper('formatPercentage', (v: string) => `${v}%`);
    Handlebars.registerPartial('header', '<div class="header">{{header.companyName}}</div>');

    const html = Handlebars.compile(source)({
      header: { companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด' },
      thaiDate: '11 สิงหาคม 2569',
      customerName: 'นางสาว ณัฏฐ์นรี วันแก้ว',
      carBrand: 'NETA',
      detailsTable: {
        sellingPrice: '759900',
        discount: '20000',
        remaining: '739900',
        bookingDeposit: '1000',
        downPayment: '110985',
        downPaymentDiscount: '0',
        insurance: '0',
        actInsurance: '0',
        registrationFee: '0',
        totalDelivery: '110985',
        financeAmount: '628915',
        interestRate: '3.29',
        installmentMonths: '60',
        monthlyPayment: '11000',
        gifts: Array.from({ length: 12 }, (_, i) => ({ name: `ของแถม ${i + 1}` })),
      },
      contactPerson: { name: 'นายณัฐนันท์ คมฤทัย', phone: '094-978-9926' },
    });

    expect(html).toContain('ty-footer');
    expect(html).toContain('ฝ่ายตรวจสอบ');
    expect(html).toContain('ขอแสดงความนับถือ');
    expect(html).toContain('ของแถม 12');
    expect(html).toContain('บริษัท วีบียอนด์ อินโนเวชั่น จำกัด');

    const siamk = Handlebars.compile(source)({
      header: { companyName: 'บริษัท สยามคราฟท์ มอเตอร์ จำกัด' },
      thaiDate: '11 สิงหาคม 2569',
      customerName: 'ลูกค้า ทดสอบ',
      carBrand: 'NETA',
      detailsTable: {
        sellingPrice: '1',
        discount: '0',
        remaining: '1',
        bookingDeposit: '0',
        downPayment: '0',
        downPaymentDiscount: '0',
        insurance: '0',
        actInsurance: '0',
        registrationFee: '0',
        totalDelivery: '0',
        financeAmount: '0',
        interestRate: '0',
        installmentMonths: '0',
        monthlyPayment: '0',
        gifts: Array.from({ length: 12 }, (_, i) => ({ name: `G${i + 1}` })),
      },
      contactPerson: { name: 'ผู้ตรวจ', phone: '0' },
    });
    expect(siamk).toContain('บริษัท สยามคราฟท์ มอเตอร์ จำกัด');
    expect(siamk).toContain('ty-footer');
    expect(siamk).toContain('G12');
  });
});
