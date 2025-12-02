/*
  Warnings:

  - A unique constraint covering the columns `[sale_id]` on the table `quotations` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `customer_id` to the `quotations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `final_price` to the `quotations` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "quotations" DROP CONSTRAINT "quotations_sale_id_fkey";

-- DropIndex
DROP INDEX "number_sequences_prefix_key";

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "customer_id" TEXT NOT NULL,
ADD COLUMN     "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "final_price" DECIMAL(15,2) NOT NULL,
ADD COLUMN     "preferred_ext_color" TEXT,
ADD COLUMN     "preferred_int_color" TEXT,
ADD COLUMN     "vehicle_model_id" TEXT,
ALTER COLUMN "sale_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "quotations_sale_id_key" ON "quotations"("sale_id");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_vehicle_model_id_fkey" FOREIGN KEY ("vehicle_model_id") REFERENCES "vehicle_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
