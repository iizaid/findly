-- CreateEnum
CREATE TYPE "CreditReservationStatus" AS ENUM ('ACTIVE', 'CAPTURED', 'RELEASED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CreditReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "campaignId" TEXT,
    "jobId" TEXT,
    "amount" INTEGER NOT NULL,
    "capturedAmount" INTEGER NOT NULL DEFAULT 0,
    "releasedAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "CreditReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditReservation_userId_status_idx" ON "CreditReservation"("userId", "status");

-- CreateIndex
CREATE INDEX "CreditReservation_workspaceId_idx" ON "CreditReservation"("workspaceId");

-- CreateIndex
CREATE INDEX "CreditReservation_campaignId_idx" ON "CreditReservation"("campaignId");

-- CreateIndex
CREATE INDEX "CreditReservation_jobId_idx" ON "CreditReservation"("jobId");

-- CreateIndex
CREATE INDEX "CreditReservation_createdAt_idx" ON "CreditReservation"("createdAt");

-- CreateIndex
CREATE INDEX "Job_status_lastHeartbeatAt_idx" ON "Job"("status", "lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "Job_cancelRequestedAt_idx" ON "Job"("cancelRequestedAt");

-- AddForeignKey
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
