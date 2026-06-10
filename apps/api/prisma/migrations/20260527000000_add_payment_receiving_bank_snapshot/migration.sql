-- Snapshot the receiving bank account onto Payment so receipts stay correct
-- even if the BankAccount row is later edited or deleted. The legacy
-- `receiving_bank` column (free-form bank code like "KBANK") is retained
-- for historical rows and continues to be written for backwards-compat.

ALTER TABLE "payments"
  ADD COLUMN "receiving_bank_name" TEXT,
  ADD COLUMN "receiving_account_number" TEXT,
  ADD COLUMN "receiving_branch" TEXT;
