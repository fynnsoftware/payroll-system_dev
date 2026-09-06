-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN     "accountTypeId" INTEGER;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_accountTypeId_fkey" FOREIGN KEY ("accountTypeId") REFERENCES "AssetAccountType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
