/*
  Warnings:

  - The values [INQUIRY,QUOTED] on the enum `SaleStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SaleStatus_new" AS ENUM ('RESERVED', 'PREPARING', 'DELIVERED', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."sales" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "sales" ALTER COLUMN "status" TYPE "SaleStatus_new" USING ("status"::text::"SaleStatus_new");
ALTER TYPE "SaleStatus" RENAME TO "SaleStatus_old";
ALTER TYPE "SaleStatus_new" RENAME TO "SaleStatus";
DROP TYPE "public"."SaleStatus_old";
ALTER TABLE "sales" ALTER COLUMN "status" SET DEFAULT 'RESERVED';
COMMIT;

-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "status" SET DEFAULT 'RESERVED';
