-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT,
ADD COLUMN "notifyReports" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifySecurity" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyMarketing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FailedLoginAttempt" (
    "ipAddress" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FailedLoginAttempt_pkey" PRIMARY KEY ("ipAddress","emailHash")
);

-- CreateIndex
CREATE INDEX "FailedLoginAttempt_expiresAt_idx" ON "FailedLoginAttempt"("expiresAt");
