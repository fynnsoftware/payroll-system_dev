/*
  Warnings:

  - Added the required column `conditionDescription` to the `DepreciationCalcType` table without a default value. This is not possible if the table is not empty.
  - Added the required column `conditionType` to the `DepreciationCalcType` table without a default value. This is not possible if the table is not empty.
  - Added the required column `formulaType` to the `DepreciationCalcType` table without a default value. This is not possible if the table is not empty.

*/

-- ⚠️ [manual fix] ล้างแถวเก่าที่ seed ไว้ด้วย schema เวอร์ชันก่อนหน้า (มีแค่ code/label)
-- ก่อน ALTER TABLE เพิ่ม column required ด้านล่าง ไม่งั้นจะ error เพราะ backfill ค่าไม่ได้
-- (ตารางนี้เป็นแค่ master data/seed data ไม่ใช่ข้อมูลธุรกรรม ลบแล้วแอปจะ lazy-seed ใหม่ให้เองตอนเรียก GET)
DELETE FROM "DepreciationCalcType";

-- AlterTable
ALTER TABLE "DepreciationCalcType" ADD COLUMN     "conditionDescription" TEXT NOT NULL,
ADD COLUMN     "conditionType" TEXT NOT NULL,
ADD COLUMN     "formulaType" TEXT NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Module" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleModuleAccess" (
    "id" SERIAL NOT NULL,
    "role" TEXT NOT NULL,
    "moduleId" INTEGER NOT NULL,

    CONSTRAINT "RoleModuleAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Module_code_key" ON "Module"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RoleModuleAccess_role_moduleId_key" ON "RoleModuleAccess"("role", "moduleId");

-- AddForeignKey
ALTER TABLE "RoleModuleAccess" ADD CONSTRAINT "RoleModuleAccess_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
