-- AlterEnum
ALTER TYPE "InviteeStatus" ADD VALUE 'CALLBACK';

-- AlterEnum
ALTER TYPE "CallOutcome" ADD VALUE 'CALLBACK_REQUESTED';

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "agentPrompt" TEXT,
ADD COLUMN     "agentVoice" TEXT;

-- AlterTable
ALTER TABLE "invitees" ADD COLUMN     "callbackAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "call_attempts" ADD COLUMN     "callbackAt" TIMESTAMP(3);

