/**
 * PDF Document Types
 * TypeScript interfaces for PDF generation data
 */

// Company header info (shared across all documents)
export interface CompanyHeader {
  logoBase64: string;
  companyName: string;
  address1: string;
  address2: string;
  phone: string;
}

// Customer information (shared)
export interface CustomerInfo {
  name: string;
  address: string;
  street: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  phone: string;
  taxId?: string;
}

// Car/Vehicle information (shared)
export interface CarInfo {
  brand: string;
  model?: string;
  engineNo: string;
  chassisNo: string;
  color: string;
  type?: string; // รถยนต์ไฟฟ้า, etc.
}

// Pricing table row
export interface PricingRow {
  label: string;
  amount: string;
  note?: string;
}

// Gift/Promotion item
export interface GiftItem {
  name: string;
}

/**
 * ใบปล่อยรถ/ใบรับรถ (Delivery Receipt)
 */
export interface DeliveryReceiptData {
  header: CompanyHeader;
  customer: CustomerInfo;
  car: CarInfo;
  deliveryDate?: string;
}

/**
 * หนังสือขอบคุณ (Thank You Letter)
 */
export interface ThankYouLetterData {
  header: CompanyHeader;
  thaiDate: string;
  customerName: string; // ชื่อลูกค้า
  carBrand: string;
  detailsTable: {
    sellingPrice: string;
    discount: string;
    remaining: string;
    downPayment: string;
    downPaymentDiscount: string;
    insurance: string;
    actInsurance: string; // พรบ.
    registrationFee: string;
    totalDelivery: string;
    financeAmount: string;
    interestRate: string;
    installmentMonths: string;
    monthlyPayment: string;
    gifts: GiftItem[];
  };
  contactPerson: {
    name: string;
    phone: string;
    position: string;
  };
}

/**
 * หนังสือยืนยันการซื้อ-ขาย (Sales Confirmation)
 */
export interface SalesConfirmationData {
  header: CompanyHeader;
  createdDate: string;
  car: CarInfo;
  customer: CustomerInfo;
  paymentMethod: string; // เงินสด / บริษัทไฟแนนซ์ / ประกันภัย
  signature?: string; // Base64 signature image
}

/**
 * ใบบันทึกการขาย (Sales Record)
 */
export interface SalesRecordData {
  header: CompanyHeader;
  customer: CustomerInfo;
  car: CarInfo;
  pricing: {
    sellingPrice: string;
    remaining: string;
    downPayment: string;
    downPaymentDiscount: string;
    insurance: string;
    actInsurance: string;
    registrationFee: string;
    totalDelivery: string;
    financeAmount: string;
    // Right column
    deductDeposit: string;
    deliveryAmount: string;
    outstandingBalance: string;
    paymentDueDate: string;
    financeCompany: string;
    interestRate: string;
    installmentMonths: string;
    monthlyPayment: string;
  };
  gifts: GiftItem[];
  staff: {
    salesConsultant: string;
    salesManager: string;
    auditor: string;
  };
}

/**
 * สัญญาจองรถยนต์ (Car Reservation Contract) - Official Form
 */
export interface CarReservationContractData {
  header: CompanyHeader;
  
  // Document identification
  documentInfo: {
    volumeNumber?: string;        // เล่มที่
    documentNumber?: string;      // เลขที่
    contractLocation?: string;    // ที่ทำสัญญา ณ
    contractDay?: string;         // วันที่
    contractMonth?: string;       // เดือน
    contractYear?: string;        // พ.ศ.
    salesManagerName?: string;    // ผู้จัดการฝ่ายขาย
    salesManagerPhone?: string;   // เบอร์
    salesStaffName?: string;      // พนักงานขาย
    salesStaffPhone?: string;     // เบอร์
  };

  // Party information (between)
  parties: {
    companyName?: string;         // ระหว่าง (บริษัท)
    dealerName?: string;          // จำกัด ผู้จำหน่าย(Dealer)
    isHeadOffice?: boolean;       // สำนักงานใหญ่
    isBranchOffice?: boolean;     // สำนักงานสาขา
    branchLocation?: string;      // ตั้งอยู่
    companyPhone?: string;        // เบอร์โทรศัพท์
    companyEmail?: string;        // อีเมล
    authorizedPerson?: string;    // ผู้มีอำนาจกระทำการแทน
    authorizedDate?: string;      // วันที่มอบอำนาจ
    authorizedMonth?: string;     // เดือนมอบอำนาจ
    authorizedYear?: string;      // พ.ศ. มอบอำนาจ
    customerName?: string;        // ชื่อลูกค้า
    customerIdCard?: string;      // เลขบัตรประจำตัวประชาชน
    customerAddress?: string;     // ที่อยู่ติดต่อลูกค้า
    customerOfficePhone?: string; // โทรศัพท์ที่ทำงาน
    customerHomePhone?: string;   // โทรศัพท์บ้าน
    customerMobile?: string;      // โทรศัพท์มือถือ
    customerEmail?: string;       // อีเมล
  };

  // Section 1.1 - Vehicle Details
  vehicleDetails: {
    type?: string;                // ประเภท/Type
    brand?: string;               // ยี่ห้อ/Brand
    model?: string;               // รุ่น/Model
    color?: string;               // สี/Color
    mfy?: string;                 // ปีที่ผลิต/MFY
    engineCCOrKW?: string;        // ขนาดเครื่องยนต์หรือกำลังของมอเตอร์ไฟฟ้า/CC or kW
    batteryType?: string;         // ประเภทของแบตเตอรี่/Battery type
    batteryCapacity?: string;     // ความจุแบตเตอรี่/Battery capacity (kWh)
    nedcRange?: string;           // ระยะทางวิ่งสูงสุด/NEDC Mode (KM)
    bookingDepositDate?: string;  // วันที่ชำระเงินจอง/Booking deposit date
  };

  // Section 1.2 - New Car Price
  pricing: {
    priceExcludeVAT?: string;     // ไม่รวมภาษีมูลค่าเพิ่ม/Exclude VAT
    priceIncludeVAT?: string;     // รวมภาษีมูลค่าเพิ่ม/Include VAT
  };

  // Section 1.3 - FOC/Accessories
  freeAccessories?: string[];      // รายการของแถม/FOC

  // Section 1.4 - Reservation Fee
  reservationFee: {
    isCash?: boolean;             // เงินสด/cash
    isBankTransfer?: boolean;     // โอนเข้าบัญชีชื่อผู้ประกอบธุรกิจ/Bank Transfer
    amount?: string;              // เป็นเงิน/amount
    accountNo?: string;           // เลขที่บัญชี/Account no.
    bank?: string;                // ธนาคาร/Bank
    isCreditCard?: boolean;       // บัตรเครดิตธนาคาร/Credit card
    isDebitCard?: boolean;        // บัตรเดบิตธนาคาร/Debit card
    cardBank?: string;            // ธนาคาร
    cashAmount?: string;          // เป็นเงิน/amount
    isCheque?: boolean;           // เช็คธนาคาร/Bank Cheque
    chequeBranch?: string;        // สาขา/Branch
    chequeNo?: string;            // เลขที่เช็ค/Cheque No
    chequeDate?: string;          // ลงวันที่/Date
  };

  // Section 1.5 - Additional Accessories
  additionalAccessories?: string[];

  // Section 2 - Primary Expenses
  primaryExpenses: {
    carPrice?: string;            // ราคารถยนต์/Car price
    downPayment?: string;         // เงินดาวน์/Down payment
    registrationFee?: string;     // ค่าจดทะเบียน/Registration Fee
    redPlateFee?: string;         // ค่ามัดจำป้ายแดง/Deposit red plate
    insurancePremium?: string;    // ค่าเบี้ยประกันภัย/Insurance Premium
    accessoryFee?: string;        // ค่าอุปกรณ์ตกแต่ง/Accessory
    otherFee?: string;            // อื่นๆ/Other
    totalExpense?: string;        // รวมค่าใช้จ่าย/Total Expense
    reservationFee?: string;      // หัก เงินจอง/Reservation Fee
    usedCarTradeIn?: string;      // หัก เงินค่ารถเก่า/Used car trade-in
    otherDiscount?: string;       // อื่นๆ/Other (ส่วนลดเงินสด)
    netTotalExpense?: string;     // รวมค่าใช้จ่ายทั้งสิ้น/Net total expense
  };

  // Section 3 - Purchase Conditions
  purchaseConditions: {
    isCash?: boolean;             // เงินสด/Cash
    isHirePurchase?: boolean;     // ทรัพย์สินเช่าซื้อ/Hire Purchase
    financeCompany?: string;      // บริษัทไฟแนนซ์/Finance company
    downPaymentPercent?: string;  // เงินดาวน์/Down payment %
    downPaymentAmount?: string;   // บาท/Baht
    interestPercent?: string;     // ดอกเบี้ย/Interest %
    isBeginning?: boolean;        // ต้นงวด/Beginning
    isEnding?: boolean;           // ปลายงวด/Ending
    financeAmount?: string;       // ยอดจัด/Finance Amount
    installmentMonths?: string;   // ผ่อนชำระ/Installment (months)
    monthlyPayment?: string;      // เดือนละ/Monthly (baht)
  };

  // Section 4 - Insurance
  insurance: {
    companyName?: string;         // บริษัท/Company Name
    partNumber?: string;          // ประเภท/Part
    sumInsured?: string;          // ทุนประกัน/Sum Insure
    specifyPremium?: boolean;     // ระบุค่าเบี้ยประกันภัย checkbox
    premiumAmount?: string;       // ระบุค่าเบี้ยประกันภัย/Premium บาท
    notSpecifyPremium?: boolean;  // ไม่ระบุค่าเบี้ยประกันภัย checkbox
    notSpecifyPremiumAmount?: string; // ไม่ระบุค่าเบี้ยประกันภัย/Premium บาท
  };

  // Section 5 - Delivery
  delivery: {
    deliveryDate?: string;        // กำหนดวันส่งมอบ/Delivery Date
    deliveryLocation?: string;    // สถานที่ส่งมอบ/Location
  };

  // Footer note checkbox
  termsAcknowledged?: boolean;
}

/**
 * สัญญาจองรถยนต์ (Contract/Reservation) - Simple version (legacy)
 */
export interface ContractData {
  header: CompanyHeader;
  reservationNumber: string;
  date: string;
  customer: CustomerInfo;
  vehicle: {
    model: string;
    color: string;
  };
  financial: {
    totalPrice: string;
    depositAmount: string;
    refundPolicy: string;
  };
}

/**
 * ใบรับเงินมัดจำ (Deposit Receipt)
 */
export interface DepositReceiptData {
  header: CompanyHeader;
  receiptNumber: string;
  date: string;
  customer: CustomerInfo;
  car: CarInfo;
  depositAmount: string;
  depositAmountText: string; // Thai text representation
  paymentMethod: string;
  note?: string;
}

/**
 * PDF generation options
 */
export interface PdfOptions {
  format?: 'A4' | 'Letter';
  width?: string; // Custom width (e.g., '9in', '228.6mm')
  height?: string; // Custom height (e.g., '5.5in', '139.7mm')
  margin?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  landscape?: boolean;
  printBackground?: boolean;
}

/**
 * Template types enum
 */
export enum PdfTemplateType {
  DELIVERY_RECEIPT = 'delivery-receipt',
  THANK_YOU_LETTER = 'thank-you-letter',
  SALES_CONFIRMATION = 'sales-confirmation',
  SALES_RECORD = 'sales-record',
  CONTRACT = 'contract',
  DEPOSIT_RECEIPT = 'deposit-receipt',
  PAYMENT_RECEIPT = 'payment-receipt',
  VEHICLE_CARD = 'vehicle-card',
  TEMPORARY_RECEIPT = 'temporary-receipt',
}

/**
 * ใบเสร็จรับเงิน (Payment Receipt)
 */
export interface PaymentReceiptData {
  header: CompanyHeader;
  receiptNumber: string;
  date: string;
  customer: CustomerInfo;
  car: CarInfo;
  amount: string;
  amountText: string;
  paymentMethod: string;
  note?: string;
}

/**
 * การ์ดรายละเอียดรถยนต์ (Vehicle Card)
 */
export interface VehicleCardData {
  header: CompanyHeader;
  stockNumber: string; // VIN or Stock No
  date: string;
  car: {
    brand: string;
    model: string;
    variant?: string;
    year: string;
    color: string; // exterior
    interiorColor?: string;
    engineNo: string;
    chassisNo: string;
    ccOrKw?: string;
  };
  costs: {
    baseCost: string;
    transportCost: string;
    accessoryCost: string;
    otherCosts: string;
    totalCost: string;
  };
  location?: string; // Parking slot
}

/**
 * Item in temporary receipt
 */
export interface TemporaryReceiptItem {
  no?: number;
  description: string;
  amount: string;
}

/**
 * ใบรับเงินชั่วคราว (Temporary Receipt) - Small Format 9x5.5 inch
 */
export interface TemporaryReceiptData {
  header: CompanyHeader & {
    fax?: string;
  };
  customerCode?: string;
  receiptNumber: string;
  date: string;
  contractNumber?: string; // เลขที่สัญญา
  customer: CustomerInfo;
  items: TemporaryReceiptItem[];
  // Totals section
  paymentAmount?: string; // ยอดชำระ
  lateFee?: string; // เบี้ยปรับล่าช้า/ภาษน.
  discount?: string; // หัก ส่วนลด
  totalAmount: string; // จำนวนเงินที่ต้องชำระ
  totalAmountText?: string; // Thai text representation
  paymentMethod?: {
    isCash?: boolean;
    isCheque?: boolean;
    isTransfer?: boolean;
    bankName?: string;
    branchName?: string;
    accountNumber?: string;
    chequeNumber?: string;
    chequeDate?: string;
    chequeAmount?: string;
    transferDate?: string;
    transferAmount?: string;
  };
  note?: string;
}
