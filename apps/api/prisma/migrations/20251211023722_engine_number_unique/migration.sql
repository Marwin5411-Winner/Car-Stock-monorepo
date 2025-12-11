/*
  Warnings:

  - A unique constraint covering the columns `[engine_number]` on the table `stocks` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('NO_DEBT', 'ACTIVE', 'PAID_OFF');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "actual_received_date" TIMESTAMP(3),
ADD COLUMN     "net_received_amount" DECIMAL(15,2),
ADD COLUMN     "receiving_bank" TEXT;

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "debt_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "debt_paid_off_date" TIMESTAMP(3),
ADD COLUMN     "debt_status" "DebtStatus" NOT NULL DEFAULT 'NO_DEBT',
ADD COLUMN     "paid_debt_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paid_interest_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "remaining_debt" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "stock_debt_payments" (
    "id" TEXT NOT NULL,
    "stock_id" TEXT NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "reference_number" TEXT,
    "principal_before" DECIMAL(15,2) NOT NULL,
    "principal_after" DECIMAL(15,2) NOT NULL,
    "accrued_interest_at_payment" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "interest_paid" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "principal_paid" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_debt_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_debt_payments_stock_id_idx" ON "stock_debt_payments"("stock_id");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_engine_number_key" ON "stocks"("engine_number");

-- AddForeignKey
ALTER TABLE "stock_debt_payments" ADD CONSTRAINT "stock_debt_payments_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
