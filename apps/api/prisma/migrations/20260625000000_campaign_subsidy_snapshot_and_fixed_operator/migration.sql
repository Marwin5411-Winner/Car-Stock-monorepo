-- Add FIXED operator to FormulaOperator enum for campaign subsidy formulas.
-- FIXED is a flat baht/car subsidy with no base calculation.
ALTER TYPE "FormulaOperator" ADD VALUE IF NOT EXISTS 'FIXED';

-- Add campaignSubsidySnapshot column to Sale model.
-- Stores per-car campaign subsidy total, frozen at sale create/update
-- (sum of the campaign's editable formulas for this model).
-- Null when no campaign.
ALTER TABLE "sales" ADD COLUMN "campaign_subsidy_snapshot" DECIMAL(15,2);
