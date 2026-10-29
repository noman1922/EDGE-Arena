-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "passwordSalt" TEXT;

-- CreateTable
CREATE TABLE "SystemErrorLog" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'FAILED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemErrorLog_category_createdAt_idx" ON "SystemErrorLog"("category", "createdAt");

-- CreateIndex
CREATE INDEX "SystemErrorLog_createdAt_idx" ON "SystemErrorLog"("createdAt");
