// ============================================
// Application Constants
// ============================================

export const APP_NAME = 'VBeyond Car Sales';
export const APP_VERSION = '1.0.0';

// ============================================
// Company Information
// ============================================

export const COMPANY = {
  name: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
  nameEn: 'VBeyond Innovation Co., Ltd.',
  address: {
    houseNumber: '438/288',
    street: 'ถนนมิตรภาพ-หนองคาย',
    subdistrict: 'ตำบลในเมือง',
    district: 'อำเภอเมือง',
    province: 'จังหวัดนครราชสีมา',
    postalCode: '30000',
  },
  phone: '044-272-888',
  fax: '044-271-224',
  fullAddress:
    '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง อำเภอเมือง จังหวัดนครราชสีมา 30000',
} as const;

// ============================================
// Role Labels (Thai)
// ============================================

export const ROLE_LABELS = {
  ADMIN: 'กรรมการ',
  SALES_MANAGER: 'ผู้จัดการขาย',
  STOCK_STAFF: 'พนักงานสต็อก',
  ACCOUNTANT: 'พนักงานบัญชี',
  SALES_STAFF: 'พนักงานขาย',
} as const;

// ============================================
// Status Labels (Thai)
// ============================================

export const STOCK_STATUS_LABELS = {
  AVAILABLE: 'พร้อมขาย',
  RESERVED: 'จองแล้ว',
  PREPARING: 'เตรียมส่งมอบ',
  SOLD: 'ขายแล้ว',
} as const;

export const SALE_STATUS_LABELS = {
  INQUIRY: 'สอบถาม',
  QUOTED: 'เสนอราคาแล้ว',
  RESERVED: 'จองแล้ว',
  PREPARING: 'เตรียมส่งมอบ',
  DELIVERED: 'ส่งมอบแล้ว',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
} as const;

export const CUSTOMER_TYPE_LABELS = {
  INDIVIDUAL: 'บุคคลธรรมดา',
  COMPANY: 'นิติบุคคล',
} as const;

export const SALES_TYPE_LABELS = {
  NORMAL_SALES: 'ขายปกติ',
  FLEET_SALES: 'ขายฟลีท',
} as const;

export const SALE_TYPE_LABELS = {
  RESERVATION_SALE: 'ขายผ่านการจอง',
  DIRECT_SALE: 'ขายตรง',
} as const;

export const PAYMENT_MODE_LABELS = {
  CASH: 'เงินสด',
  FINANCE: 'ผ่านไฟแนนซ์',
  MIXED: 'ผสม',
} as const;

export const PAYMENT_TYPE_LABELS = {
  DEPOSIT: 'เงินจอง',
  DOWN_PAYMENT: 'เงินดาวน์',
  FINANCE_PAYMENT: 'ยอดไฟแนนซ์',
  OTHER_EXPENSE: 'ค่าใช้จ่ายอื่น',
} as const;

export const PAYMENT_METHOD_LABELS = {
  CASH: 'เงินสด',
  BANK_TRANSFER: 'โอนเงิน',
  CHEQUE: 'เช็ค',
  CREDIT_CARD: 'บัตรเครดิต',
} as const;

export const REFUND_POLICY_LABELS = {
  FULL: 'คืนเงินเต็มจำนวน',
  PARTIAL: 'คืนเงินบางส่วน',
  NO_REFUND: 'ไม่คืนเงิน',
} as const;

export const VEHICLE_TYPE_LABELS = {
  SUV: 'SUV',
  SEDAN: 'Sedan',
  PICKUP: 'Pickup',
  HATCHBACK: 'Hatchback',
  MPV: 'MPV',
  EV: 'Electric Vehicle',
} as const;

export const QUOTATION_STATUS_LABELS = {
  DRAFT: 'ร่าง',
  SENT: 'ส่งแล้ว',
  ACCEPTED: 'ซื้อ',
  REJECTED: 'ไม่ซื้อ',
  EXPIRED: 'หมดอายุ',
  CONVERTED: 'แปลงเป็นการจอง',
} as const;

export const CAMPAIGN_STATUS_LABELS = {
  DRAFT: 'ร่าง',
  ACTIVE: 'ใช้งาน',
  ENDED: 'สิ้นสุด',
} as const;

// ============================================
// Document Labels
// ============================================

export const DOCUMENT_TYPE_LABELS = {
  RESERVATION_CONTRACT: 'สัญญาจองรถยนต์',
  SHORT_RESERVATION_FORM: 'ใบจอง (ย่อ)',
  CAR_DETAIL_CARD: 'การ์ดรายละเอียดรถยนต์',
  SALES_CONFIRMATION: 'หนังสือยืนยันการซื้อ-ขาย',
  SALES_RECORD: 'ใบบันทึกการขาย',
  DELIVERY_RECEIPT: 'ใบปล่อยรถ/ใบรับรถ',
  THANK_YOU_LETTER: 'หนังสือขอบคุณ',
} as const;

// ============================================
// Number Prefixes
// ============================================

export const NUMBER_PREFIXES = {
  CUSTOMER: 'CUST',
  SALE: 'SL',
  QUOTATION: 'QTN',
  RESERVATION: 'RSV',
  RECEIPT: 'RCPT',
} as const;

// ============================================
// Pagination Defaults
// ============================================

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// ============================================
// Status Colors (for UI)
// ============================================

export const STOCK_STATUS_COLORS = {
  AVAILABLE: 'green',
  RESERVED: 'yellow',
  PREPARING: 'blue',
  SOLD: 'gray',
} as const;

export const SALE_STATUS_COLORS = {
  INQUIRY: 'gray',
  QUOTED: 'blue',
  RESERVED: 'yellow',
  PREPARING: 'orange',
  DELIVERED: 'cyan',
  COMPLETED: 'green',
  CANCELLED: 'red',
} as const;

// ============================================
// Thai Provinces (for dropdown)
// ============================================

export const THAI_PROVINCES = [
  'กรุงเทพมหานคร',
  'กระบี่',
  'กาญจนบุรี',
  'กาฬสินธุ์',
  'กำแพงเพชร',
  'ขอนแก่น',
  'จันทบุรี',
  'ฉะเชิงเทรา',
  'ชลบุรี',
  'ชัยนาท',
  'ชัยภูมิ',
  'ชุมพร',
  'เชียงราย',
  'เชียงใหม่',
  'ตรัง',
  'ตราด',
  'ตาก',
  'นครนายก',
  'นครปฐม',
  'นครพนม',
  'นครราชสีมา',
  'นครศรีธรรมราช',
  'นครสวรรค์',
  'นนทบุรี',
  'นราธิวาส',
  'น่าน',
  'บึงกาฬ',
  'บุรีรัมย์',
  'ปทุมธานี',
  'ประจวบคีรีขันธ์',
  'ปราจีนบุรี',
  'ปัตตานี',
  'พระนครศรีอยุธยา',
  'พังงา',
  'พัทลุง',
  'พิจิตร',
  'พิษณุโลก',
  'เพชรบุรี',
  'เพชรบูรณ์',
  'แพร่',
  'พะเยา',
  'ภูเก็ต',
  'มหาสารคาม',
  'มุกดาหาร',
  'แม่ฮ่องสอน',
  'ยะลา',
  'ยโสธร',
  'ร้อยเอ็ด',
  'ระนอง',
  'ระยอง',
  'ราชบุรี',
  'ลพบุรี',
  'ลำปาง',
  'ลำพูน',
  'เลย',
  'ศรีสะเกษ',
  'สกลนคร',
  'สงขลา',
  'สตูล',
  'สมุทรปราการ',
  'สมุทรสงคราม',
  'สมุทรสาคร',
  'สระแก้ว',
  'สระบุรี',
  'สิงห์บุรี',
  'สุโขทัย',
  'สุพรรณบุรี',
  'สุราษฎร์ธานี',
  'สุรินทร์',
  'หนองคาย',
  'หนองบัวลำภู',
  'อ่างทอง',
  'อุดรธานี',
  'อุทัยธานี',
  'อุตรดิตถ์',
  'อุบลราชธานี',
  'อำนาจเจริญ',
] as const;

// ============================================
// Permission Matrix
// ============================================

export const PERMISSIONS = {
  // User Management
  USER_CREATE: ['ADMIN'],
  USER_UPDATE: ['ADMIN'],
  USER_DELETE: ['ADMIN'],
  USER_VIEW: ['ADMIN'],

  // Customer Management
  CUSTOMER_CREATE: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF'],
  CUSTOMER_UPDATE: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF'],
  CUSTOMER_DELETE: ['ADMIN'],
  CUSTOMER_VIEW: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'],

  // Stock Management
  STOCK_CREATE: ['ADMIN', 'STOCK_STAFF'],
  STOCK_UPDATE: ['ADMIN', 'STOCK_STAFF'],
  STOCK_DELETE: ['ADMIN'],
  STOCK_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'],
  STOCK_VIEW_COST: ['ADMIN', 'STOCK_STAFF'],

  // Sales Management
  SALE_CREATE: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF'],
  SALE_UPDATE: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF'],
  SALE_DELETE: ['ADMIN'],
  SALE_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'],
  SALE_VIEW_PROFIT: ['ADMIN', 'SALES_MANAGER'],

  // Payment Management
  PAYMENT_CREATE: ['ADMIN', 'ACCOUNTANT', 'SALES_STAFF'],
  PAYMENT_VOID: ['ADMIN', 'ACCOUNTANT'],
  PAYMENT_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'],

  // Campaign Management
  CAMPAIGN_CREATE: ['ADMIN'],
  CAMPAIGN_UPDATE: ['ADMIN'],
  CAMPAIGN_DELETE: ['ADMIN'],
  CAMPAIGN_VIEW: ['ADMIN', 'SALES_MANAGER', 'ACCOUNTANT', 'SALES_STAFF'],

  // Interest Management
  INTEREST_VIEW: ['ADMIN', 'ACCOUNTANT', 'STOCK_STAFF'],
  INTEREST_UPDATE: ['ADMIN', 'ACCOUNTANT'],

  // Reports
  REPORT_ALL: ['ADMIN'],
  REPORT_SALES: ['ADMIN', 'SALES_MANAGER'],
  REPORT_STOCK: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF'],
  REPORT_FINANCE: ['ADMIN', 'ACCOUNTANT'],

  // Documents
  DOC_CAR_DETAIL_CARD: ['ADMIN', 'STOCK_STAFF', 'ACCOUNTANT'],
  DOC_SALES_RECORD: ['ADMIN', 'ACCOUNTANT'],
  DOC_GENERAL: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'],
} as const;

export type Permission = keyof typeof PERMISSIONS;
