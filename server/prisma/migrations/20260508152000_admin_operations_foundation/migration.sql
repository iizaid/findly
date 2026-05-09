-- CreateTable
CREATE TABLE "BackendErrorLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "userId" TEXT,
    "route" TEXT,
    "method" TEXT,
    "statusCode" INTEGER NOT NULL,
    "errorCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackendErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackendErrorLog_userId_idx" ON "BackendErrorLog"("userId");

-- CreateIndex
CREATE INDEX "BackendErrorLog_statusCode_idx" ON "BackendErrorLog"("statusCode");

-- CreateIndex
CREATE INDEX "BackendErrorLog_errorCode_idx" ON "BackendErrorLog"("errorCode");

-- CreateIndex
CREATE INDEX "BackendErrorLog_createdAt_idx" ON "BackendErrorLog"("createdAt");

-- AddForeignKey
ALTER TABLE "BackendErrorLog" ADD CONSTRAINT "BackendErrorLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

