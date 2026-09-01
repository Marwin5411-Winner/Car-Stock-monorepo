-- Capture the schema changes that were only ever applied with `prisma db push`.
--
-- Why this exists
--   `20260618000000_add_percent_subtract_operator` does
--   `ALTER TYPE "FormulaOperator" ADD VALUE ...`, but no migration ever created
--   that type - it, the campaign formula/company settings tables, several sales
--   and stocks columns, two enum extensions and ~20 indexes only ever reached a
--   database through `db push`. Existing installs therefore look fine, while
--   `prisma migrate deploy` on a FRESH database dies at that migration with
--   `type "FormulaOperator" does not exist`. Every clean install of the portable
--   Windows package was broken.
--
--   This migration is dated before 20260618000000 so a fresh database builds the
--   type before the migration that extends it.
--
-- Safety
--   Every statement is idempotent (IF NOT EXISTS / DROP-then-ADD for constraints)
--   because on an already-drifted install these objects are already present. It
--   creates and widens only - it drops no table, column or data.
--
--   "FormulaOperator" is created with its ORIGINAL four values; 'PERCENT_SUBTRACT'
--   and 'FIXED' are still added by 20260618000000 and 20260625000000 respectively,
--   so the later migrations remain meaningful instead of becoming silent no-ops.

-- CreateEnum (no CREATE TYPE IF NOT EXISTS in PostgreSQL)
DO $$ BEGIN
    CREATE TYPE "FormulaOperator" AS ENUM ('ADD', 'SUBTRACT', 'MULTIPLY', 'PERCENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "FormulaPriceTarget" AS ENUM ('COST_PRICE', 'SELLING_PRICE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
ALTER TYPE "StockStatus" ADD VALUE IF NOT EXISTS 'DEMO';

-- AlterEnum
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'COUPE';
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'CONVERTIBLE';
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'WAGON';
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'VAN';
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'TRUCK';
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'CROSSOVER';

-- AlterTable
ALTER TABLE "sales"
    ADD COLUMN IF NOT EXISTS "car_discount" DECIMAL(15,2),
    ADD COLUMN IF NOT EXISTS "contract_document_number" TEXT,
    ADD COLUMN IF NOT EXISTS "contract_volume_number" TEXT,
    ADD COLUMN IF NOT EXISTS "down_payment_discount" DECIMAL(15,2),
    ADD COLUMN IF NOT EXISTS "interest_rate" DECIMAL(5,4),
    ADD COLUMN IF NOT EXISTS "monthly_installment" DECIMAL(15,2),
    ADD COLUMN IF NOT EXISTS "number_of_terms" INTEGER;

-- AlterTable
ALTER TABLE "stocks"
    ADD COLUMN IF NOT EXISTS "received_from" TEXT,
    ADD COLUMN IF NOT EXISTS "stock_number" TEXT;
ALTER TABLE "stocks" ALTER COLUMN "arrival_date" DROP NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "campaign_model_formulas" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "vehicle_model_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operator" "FormulaOperator" NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "price_target" "FormulaPriceTarget" NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_model_formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "company_settings" (
    "id" TEXT NOT NULL,
    "company_name_th" TEXT NOT NULL,
    "company_name_en" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "address_th" TEXT NOT NULL,
    "address_en" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "fax" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "campaign_model_formulas_campaign_id_vehicle_model_id_idx" ON "campaign_model_formulas"("campaign_id", "vehicle_model_id");
CREATE INDEX IF NOT EXISTS "activity_logs_user_id_idx" ON "activity_logs"("user_id");
CREATE INDEX IF NOT EXISTS "activity_logs_entity_entity_id_idx" ON "activity_logs"("entity", "entity_id");
CREATE INDEX IF NOT EXISTS "activity_logs_created_at_idx" ON "activity_logs"("created_at");
CREATE INDEX IF NOT EXISTS "payments_customer_id_idx" ON "payments"("customer_id");
CREATE INDEX IF NOT EXISTS "payments_sale_id_idx" ON "payments"("sale_id");
CREATE INDEX IF NOT EXISTS "payments_payment_date_idx" ON "payments"("payment_date");
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments"("status");
CREATE INDEX IF NOT EXISTS "payments_created_at_idx" ON "payments"("created_at");
CREATE INDEX IF NOT EXISTS "sale_history_sale_id_idx" ON "sale_history"("sale_id");
CREATE INDEX IF NOT EXISTS "sales_status_idx" ON "sales"("status");
CREATE INDEX IF NOT EXISTS "sales_customer_id_idx" ON "sales"("customer_id");
CREATE INDEX IF NOT EXISTS "sales_created_by_id_idx" ON "sales"("created_by_id");
CREATE INDEX IF NOT EXISTS "sales_created_at_idx" ON "sales"("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "stocks_stock_number_key" ON "stocks"("stock_number");
CREATE INDEX IF NOT EXISTS "stocks_status_idx" ON "stocks"("status");
CREATE INDEX IF NOT EXISTS "stocks_vehicle_model_id_idx" ON "stocks"("vehicle_model_id");
CREATE INDEX IF NOT EXISTS "stocks_deleted_at_idx" ON "stocks"("deleted_at");
CREATE INDEX IF NOT EXISTS "stocks_created_at_idx" ON "stocks"("created_at");
CREATE INDEX IF NOT EXISTS "stocks_arrival_date_idx" ON "stocks"("arrival_date");
CREATE INDEX IF NOT EXISTS "stocks_sold_date_idx" ON "stocks"("sold_date");

-- AddForeignKey (drop first so re-running is a no-op instead of "already exists")
ALTER TABLE "campaign_model_formulas" DROP CONSTRAINT IF EXISTS "campaign_model_formulas_campaign_id_vehicle_model_id_fkey";
ALTER TABLE "campaign_model_formulas" ADD CONSTRAINT "campaign_model_formulas_campaign_id_vehicle_model_id_fkey" FOREIGN KEY ("campaign_id", "vehicle_model_id") REFERENCES "campaign_vehicle_models"("campaign_id", "vehicle_model_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cascade deletes for a sale's documents and history (schema.prisma has always
-- said onDelete: Cascade; only the init migration still had the default).
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_sale_id_fkey";
ALTER TABLE "documents" ADD CONSTRAINT "documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_history" DROP CONSTRAINT IF EXISTS "sale_history_sale_id_fkey";
ALTER TABLE "sale_history" ADD CONSTRAINT "sale_history_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
