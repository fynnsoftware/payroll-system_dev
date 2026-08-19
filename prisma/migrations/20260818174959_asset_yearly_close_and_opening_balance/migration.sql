/*
  Warnings:

  - You are about to drop the column `periodEndDate` on the `Company` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "openingAccumDepr" DECIMAL(65,30),
ADD COLUMN     "openingAsOfDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "periodEndDate";

-- CreateTable
CREATE TABLE "AssetYearlyClose" (
    "id" SERIAL NOT NULL,
    "assetId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "accumDeprBF" DECIMAL(65,30) NOT NULL,
    "depreciationForYear" DECIMAL(65,30) NOT NULL,
    "accumDeprCF" DECIMAL(65,30) NOT NULL,
    "nbv" DECIMAL(65,30) NOT NULL,
    "calcTypeLabel" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT NOT NULL,

    CONSTRAINT "AssetYearlyClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetModuleSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nearExpiryWarningDays" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssetModuleSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetYearlyClose_assetId_year_key" ON "AssetYearlyClose"("assetId", "year");

-- AddForeignKey
ALTER TABLE "AssetYearlyClose" ADD CONSTRAINT "AssetYearlyClose_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
