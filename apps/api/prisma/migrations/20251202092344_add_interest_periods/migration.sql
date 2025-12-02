-- CreateTable
CREATE TABLE "interest_periods" (
    "id" TEXT NOT NULL,
    "stock_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "annual_rate" DECIMAL(5,2) NOT NULL,
    "principal_base" "InterestBase" NOT NULL DEFAULT 'BASE_COST_ONLY',
    "principal_amount" DECIMAL(15,2) NOT NULL,
    "calculated_interest" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "days_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "interest_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interest_periods_stock_id_idx" ON "interest_periods"("stock_id");

-- AddForeignKey
ALTER TABLE "interest_periods" ADD CONSTRAINT "interest_periods_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
