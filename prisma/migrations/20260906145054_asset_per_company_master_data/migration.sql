/*
  Warnings:

  - A unique constraint covering the columns `[companyId,codePrefix]` on the table `AssetCategory` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN     "codePrefix" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_companyId_codePrefix_key" ON "AssetCategory"("companyId", "codePrefix");
