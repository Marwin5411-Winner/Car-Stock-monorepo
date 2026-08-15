-- AlterTable: optional passport number for foreign customers (separate from tax_id)
ALTER TABLE "customers" ADD COLUMN "passport_number" TEXT;

CREATE UNIQUE INDEX "customers_passport_number_key" ON "customers"("passport_number");
