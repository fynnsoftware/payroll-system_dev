/*
  Warnings:

  - You are about to drop the column `nearExpiryWarningDays` on the `AssetModuleSettings` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[companyId,name]` on the table `AssetCategory` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "AssetCategory_name_key";

-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN     "companyId" INTEGER;

-- AlterTable
ALTER TABLE "AssetModuleSettings" DROP COLUMN "nearExpiryWarningDays";

-- CreateTable
CREATE TABLE "AssetAccountType" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetAccountType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCompanySettings" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nearExpiryWarningDays" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssetCompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetAccountType_companyId_code_key" ON "AssetAccountType"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCompanySettings_companyId_key" ON "AssetCompanySettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_companyId_name_key" ON "AssetCategory"("companyId", "name");

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAccountType" ADD CONSTRAINT "AssetAccountType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCompanySettings" ADD CONSTRAINT "AssetCompanySettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
