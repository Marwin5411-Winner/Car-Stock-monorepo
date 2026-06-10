-- Add six expense fields to the sales table.
-- Three are charged to the buyer (affect remainingAmount);
-- three are dealer-side fields for profit reporting only.

ALTER TABLE "sales"
  ADD COLUMN "insurance_fee" DECIMAL(15,2),
  ADD COLUMN "compulsory_insurance_fee" DECIMAL(15,2),
  ADD COLUMN "registration_fee" DECIMAL(15,2),
  ADD COLUMN "sales_commission" DECIMAL(15,2),
  ADD COLUMN "sales_expense" DECIMAL(15,2),
  ADD COLUMN "finance_commission" DECIMAL(15,2);
