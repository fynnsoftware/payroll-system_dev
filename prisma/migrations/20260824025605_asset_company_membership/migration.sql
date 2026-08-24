-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'PAYROLL';

-- CreateTable
CREATE TABLE "AssetCompanyMember" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "companyId" INTEGER NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetCompanyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetCompanyMember_userId_companyId_key" ON "AssetCompanyMember"("userId", "companyId");

-- AddForeignKey
ALTER TABLE "AssetCompanyMember" ADD CONSTRAINT "AssetCompanyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCompanyMember" ADD CONSTRAINT "AssetCompanyMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
