-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'MISCELLANEOUS';

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_sale_id_fkey";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "description" TEXT,
ALTER COLUMN "sale_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
