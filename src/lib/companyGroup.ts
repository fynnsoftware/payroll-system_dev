// src/lib/companyGroup.ts
// 🌟 [group_dup] ตัวช่วยเรื่อง "เครือบริษัท" — ใช้ร่วมกันทุกที่ที่ต้องรู้ว่าบริษัทไหนอยู่เครือเดียวกัน
//
// กติกาที่ระบบใช้: รหัสทรัพย์สินห้ามซ้ำ "ภายในเครือ" แต่ข้ามเครือซ้ำกันได้
//   บริษัท A (แม่) + A1, A2 (ลูก)  -> ทั้งสามใช้รหัสซ้ำกันไม่ได้
//   บริษัท B (คนละเครือ)           -> ใช้รหัสเดียวกับ A ได้ ถือว่าไม่ซ้ำ
//
// โครงสร้างบริษัทถูกบังคับให้ลึกได้แค่ 2 ชั้น (ดู validateParent ใน api/asset-companies/route.ts)
// ต้นเครือจึงคำนวณง่ายๆ ว่า parentId ?? id ไม่ต้องไล่ recursive
// แต่ฟังก์ชันในไฟล์นี้ยังเผื่อกรณีลึกกว่านั้นไว้ เพื่อไม่ให้พังเงียบๆ ถ้าวันหน้าปลดข้อจำกัด
import { prisma } from "@/lib/prisma";

const MAX_DEPTH = 20; // กันสายบริษัทที่ผูก parent วนกันเองจนลูปไม่จบ

/**
 * บริษัทต้นเครือของบริษัทนี้ — ค่าที่ใช้เก็บลง Asset.groupRootId
 * บริษัทแม่จะได้ id ของตัวเอง, บริษัทลูกจะได้ id ของแม่
 */
export async function getGroupRootId(companyId: number): Promise<number> {
  let current = companyId;
  for (let i = 0; i < MAX_DEPTH; i++) {
    const c = await prisma.company.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    if (!c || c.parentId === null) return current;
    current = c.parentId;
  }
  return current;
}

/** บริษัททั้งหมดที่อยู่ในเครือเดียวกับบริษัทนี้ (รวมตัวมันเอง) */
export async function getGroupCompanyIds(companyId: number): Promise<number[]> {
  const rootId = await getGroupRootId(companyId);
  const children = await prisma.company.findMany({
    where: { parentId: rootId },
    select: { id: true },
  });
  return [rootId, ...children.map((c) => c.id)];
}

/**
 * ทรัพย์สินในเครือที่ใช้รหัสเหล่านี้อยู่แล้ว — ใช้ทั้งตอนเตือนรหัสซ้ำและตอนรันเลขถัดไป
 * ค้นด้วย groupRootId ตรงๆ (มี index) ไม่ต้อง join ตาราง Company
 */
export async function findGroupAssetsByCodePrefix(
  groupRootId: number,
  prefix: string,
  excludeAssetId?: string | null,
): Promise<string[]> {
  const rows = await prisma.asset.findMany({
    where: {
      groupRootId,
      assetCode: { startsWith: prefix },
      ...(excludeAssetId ? { id: { not: excludeAssetId } } : {}),
    },
    select: { assetCode: true },
  });
  return rows.map((r) => r.assetCode);
}

/**
 * ซิงก์ groupRootId ของทรัพย์สินให้ตรงกับโครงสร้างบริษัทปัจจุบัน
 *
 * ⚠️ ต้องเรียกทุกครั้งที่ "บริษัทแม่ของบริษัทเปลี่ยน" ไม่งั้นค่า derived จะค้างเป็นของเครือเดิม
 * แล้ว unique constraint จะบังคับผิดเครือ (ปล่อยให้รหัสซ้ำในเครือใหม่ได้ ทั้งที่ควรกัน)
 *
 * คืนจำนวนแถวที่อัปเดต
 */
export async function resyncAssetGroupRoots(companyIds: number[]): Promise<number> {
  let updated = 0;
  for (const companyId of companyIds) {
    const rootId = await getGroupRootId(companyId);
    const res = await prisma.asset.updateMany({
      where: { companyId, groupRootId: { not: rootId } },
      data: { groupRootId: rootId },
    });
    updated += res.count;
  }
  return updated;
}

/**
 * ตรวจว่าการย้ายบริษัทเข้าเครือใหม่จะทำให้รหัสทรัพย์สินชนกันหรือไม่
 * คืนรายการรหัสที่จะชน (ว่าง = ย้ายได้)
 *
 * ⚠️ ต้องเช็คก่อนบันทึก เพราะถ้าปล่อยให้ชนแล้วค่อยให้ DB เด้ง unique
 * ผู้ใช้จะเห็นแค่ error ดิบๆ ไม่รู้ว่าต้องไปแก้รหัสตัวไหนบ้าง
 */
export async function findCodeCollisionsOnMove(
  movingCompanyIds: number[],
  newGroupRootId: number,
): Promise<string[]> {
  if (movingCompanyIds.length === 0) return [];

  const moving = await prisma.asset.findMany({
    where: { companyId: { in: movingCompanyIds } },
    select: { assetCode: true },
  });
  if (moving.length === 0) return [];

  const movingCodes = moving.map((a) => a.assetCode);
  const clash = await prisma.asset.findMany({
    where: {
      groupRootId: newGroupRootId,
      assetCode: { in: movingCodes },
      companyId: { notIn: movingCompanyIds },
    },
    select: { assetCode: true },
    distinct: ["assetCode"],
  });
  return clash.map((a) => a.assetCode);
}
