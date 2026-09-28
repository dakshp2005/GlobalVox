-- AlterTable
ALTER TABLE "call_attempts" ADD COLUMN     "summary" TEXT,
ADD COLUMN     "transcript" JSONB;
