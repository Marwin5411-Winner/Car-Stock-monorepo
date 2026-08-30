/**
 * Re-export brand-submission PDF projection from shared so API tests and
 * pdf.controller keep the existing import path.
 */
export {
  PDF_CLAIM_EXPENSE_COLUMNS,
  projectCampaignClaimForPdf,
  resolvePdfClaimExpenseKey,
} from '@car-stock/shared/campaign-claim-pdf';
export type {
  CampaignClaimPdfProjection,
  CampaignClaimReportForPdf,
  PdfClaimExpenseColumn,
} from '@car-stock/shared/campaign-claim-pdf';
