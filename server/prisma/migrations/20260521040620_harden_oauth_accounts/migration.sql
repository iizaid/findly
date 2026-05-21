-- DropIndex
DROP INDEX "OAuthAccount_userId_idx";

-- AlterTable
ALTER TABLE "OAuthAccount" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "displayName" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_userId_provider_key" ON "OAuthAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX "OAuthState_provider_idx" ON "OAuthState"("provider");
