// src/lib/assetScope.ts
// 🌟 [asset_redesign] ขอบเขตบริษัทที่ user เข้าถึงได้ "ในโมดูล Asset"
//
// ⚠️ อย่าสับสนกับ src/lib/companyScope.ts — ตัวนั้นใช้กับฝั่ง payroll (กฎเครือบริษัท แม่เห็นลูก)
// ฝั่ง Asset ใช้กฎคนละแบบ: เข้าถึงได้ต้องผ่าน 2 ชั้นพร้อมกัน
//   1. บริษัทนั้นเปิด module Assessment ไว้ (CompanyModule) = บริษัทซื้อบริการแล้ว
//   2. user มีแถวใน AssetCompanyMember ของบริษัทนั้น = ได้รับสิทธิ์เข้าถึง
// ADMIN ข้ามทั้งสองชั้น เห็นและแก้ไขได้ทุกบริษัทเสมอ
import { prisma } from "@/lib/prisma";

export const ASSET_MODULE_CODE = "ASSET";

/**
 * คืน array ของ companyId ที่ user เข้าถึงได้ในโมดูล Asset
 * - null = ไม่จำกัด (ADMIN)
 * - []   = ไม่มีสิทธิ์เห็นบริษัทไหนเลย
 */
export async function getAssetCompanyIds(token: any): Promise<number[] | null> {
  if (!token) return [];
  if (token.role === "ADMIN") return null; // ADMIN เห็นทุกบริษัท

  // 🔒 โมดูล Asset เปิดให้เฉพาะ role ASSET (และ ADMIN ด้านบน) เท่านั้น
  // role HR / USER ไม่เกี่ยวกับงานทรัพย์สิน ตัดออกที่นี่เลยเพื่อไม่ให้แค่ซ่อนเมนูแล้วยิง API ตรงได้
  // (กันเคส admin เผลอแอด HR เป็น member ของบริษัทด้วย)
  if (token.role !== "ASSET") return [];

  const userId = token.id as string | undefined;
  if (!userId) return [];

  // ชั้นที่ 2: บริษัทที่ user เป็นสมาชิก
  const memberships = await prisma.assetCompanyMember.findMany({
    where: { userId },
    select: { companyId: true },
  });
  if (memberships.length === 0) return [];

  const memberCompanyIds = memberships.map((m) => m.companyId);

  // ชั้นที่ 1: กรองเหลือเฉพาะบริษัทที่เปิด module Assessment ไว้
  const enabled = await prisma.companyModule.findMany({
    where: {
      companyId: { in: memberCompanyIds },
      module: { code: ASSET_MODULE_CODE },
    },
    select: { companyId: true },
  });

  return enabled.map((e) => e.companyId);
}

/** เช็คว่า user เข้าถึงบริษัทนี้ได้ไหมในโมดูล Asset */
export function isAssetCompanyAllowed(
  allowedIds: number[] | null,
  companyId: number,
): boolean {
  if (allowedIds === null) return true; // ADMIN
  return allowedIds.includes(companyId);
}

/**
 * แยกสาเหตุที่เข้าไม่ได้ เพื่อให้ UI บอกผู้ใช้ได้ตรงจุด
 * (กันเคสเห็นหน้าจอว่างเปล่าแล้วไม่รู้ว่าเพราะอะไร)
 */
export async function explainAssetAccessDenied(
  token: any,
  companyId: number,
): Promise<string> {
  const userId = token?.id as string | undefined;
  if (!userId) return "กรุณาเข้าสู่ระบบใหม่";

  const isMember = await prisma.assetCompanyMember.findFirst({
    where: { userId, companyId },
    select: { id: true },
  });
  if (!isMember) {
    return "คุณไม่ได้รับสิทธิ์เข้าถึงข้อมูลของบริษัทนี้ กรุณาติดต่อผู้ดูแลระบบ";
  }

  const moduleOn = await prisma.companyModule.findFirst({
    where: { companyId, module: { code: ASSET_MODULE_CODE } },
    select: { id: true },
  });
  if (!moduleOn) {
    return "บริษัทนี้ปิดการใช้งานระบบทรัพย์สินอยู่ กรุณาติดต่อผู้ดูแลระบบ";
  }

  return "ไม่มีสิทธิ์เข้าถึงข้อมูลของบริษัทนี้";
}
