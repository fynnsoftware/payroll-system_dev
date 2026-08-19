-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "bank" TEXT,
ADD COLUMN     "bankAccount" TEXT;

-- CreateTable
CREATE TABLE "ImportLog" (
    "id" SERIAL NOT NULL,
    "importDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filename" TEXT NOT NULL,
    "importedBy" TEXT NOT NULL,
    "totalRecords" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "ImportLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PayrollImportBatch" ADD CONSTRAINT "PayrollImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
