-- 🌟 [group_dup] เปลี่ยนขอบเขต "ห้ามซ้ำ" ของรหัสทรัพย์สิน จากทั้งตาราง -> ภายในเครือบริษัท
--
-- เดิม: Asset.assetCode เป็น unique ทั้งตาราง บริษัทที่ไม่เกี่ยวข้องกันเลยก็แย่งรหัสกัน
-- ใหม่: unique ที่ (groupRootId, assetCode) — คนละเครือใช้รหัสเดียวกันได้ ถือว่าคนละทะเบียน
--
-- groupRootId = บริษัทต้นเครือ = Company.parentId ?? Company.id
-- เป็นค่า derived ที่ต้องตรึงไว้เป็นคอลัมน์จริง เพราะ unique index อ้างข้ามตารางไม่ได้
-- (ถ้าไปเช็คในโค้ดแทน จะมีช่องว่าง race condition ตอนสองคนกดบันทึกพร้อมกัน)
--
-- ⚠️ เขียน SQL เองแทนให้ Prisma generate เพราะคอลัมน์เป็น NOT NULL และมีข้อมูลเดิมอยู่แล้ว
-- ต้อง backfill ให้ครบก่อนถึงจะบังคับ NOT NULL ได้ ไม่งั้น migration จะล้มทันที

-- 1) เพิ่มคอลัมน์แบบยอมว่างไว้ก่อน เพื่อให้แถวเดิมผ่าน
ALTER TABLE "Asset" ADD COLUMN "groupRootId" INTEGER;

-- 2) backfill จากโครงสร้างบริษัทปัจจุบัน
UPDATE "Asset" a
SET "groupRootId" = COALESCE(c."parentId", c."id")
FROM "Company" c
WHERE c."id" = a."companyId";

-- 3) บังคับ NOT NULL หลัง backfill ครบแล้ว
ALTER TABLE "Asset" ALTER COLUMN "groupRootId" SET NOT NULL;

-- 4) ถอด unique เดิมที่บังคับทั้งตาราง
DROP INDEX IF EXISTS "Asset_assetCode_key";

-- 5) unique ใหม่ระดับเครือ + index สำหรับ query ที่ค้นด้วย groupRootId
--
-- ⚠️ ถ้าขั้นนี้ล้มด้วย duplicate key แปลว่ามีรหัสซ้ำกันอยู่แล้วภายในเครือเดียวกัน
-- ซึ่งไม่ควรเกิด เพราะ unique เดิมเข้มกว่า (ห้ามซ้ำทั้งตาราง) — ให้ตรวจข้อมูลก่อนรันซ้ำ
CREATE UNIQUE INDEX "Asset_groupRootId_assetCode_key" ON "Asset"("groupRootId", "assetCode");
CREATE INDEX "Asset_groupRootId_idx" ON "Asset"("groupRootId");
