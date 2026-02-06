-- Add deleted_at column to stocks table for soft delete support
ALTER TABLE "stocks" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
