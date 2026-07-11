-- AlterTable: track which standard finance fields were manually edited
ALTER TABLE "sales" ADD COLUMN "finance_edited_keys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable: custom / manual finance line items on a sale
CREATE TABLE "sale_finance_lines" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CUSTOM',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_finance_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_finance_lines_sale_id_idx" ON "sale_finance_lines"("sale_id");

-- AddForeignKey
ALTER TABLE "sale_finance_lines" ADD CONSTRAINT "sale_finance_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
