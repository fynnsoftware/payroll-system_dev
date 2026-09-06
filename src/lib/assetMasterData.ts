// src/lib/assetMasterData.ts
// 🌟 [per_company] master data ฝั่ง Asset ที่แยกขาดตามบริษัท
//
// เดิมประเภททรัพย์สินเป็นตารางกลางทั้งระบบ ทำให้บริษัทหนึ่งแก้แล้วกระทบรายงานของอีกบริษัท
// ตอนนี้ทุกบริษัทมีชุดของตัวเอง และได้ชุดตั้งต้นอัตโนมัติตอนใช้งานครั้งแรก
//
// ⚠️ การ seed เป็นแบบ lazy (เรียกตอน GET) ไม่ใช่ตอนสร้างบริษัทอย่างเดียว
// เพราะบริษัทที่มีอยู่ก่อนหน้านี้จะไม่มีใครไปสร้างให้ ถ้า seed เฉพาะตอน create
// บริษัทเก่าจะเปิดหน้า Settings มาแล้วเจอรายการว่างเปล่าโดยไม่มีทางแก้
import { prisma } from "@/lib/prisma";

/** ประเภททรัพย์สินตั้งต้นของบริษัทใหม่ พร้อม prefix รหัส A/B/C/D ตามที่ใช้กันอยู่เดิม */
export const DEFAULT_ASSET_CATEGORIES = [
  { name: "เครื่องใช้สำนักงาน", codePrefix: "A" },
  { name: "เครื่องจักรและอุปกรณ์", codePrefix: "B" },
  { name: "ยานพาหนะ", codePrefix: "C" },
  { name: "อาคาร", codePrefix: "D" },
];

/** ประเภทบัญชี (ผังบัญชี) ตั้งต้นของบริษัทใหม่ */
export const DEFAULT_ACCOUNT_TYPES = [
  { code: "10000000", name: "สินทรัพย์" },
  { code: "11000000", name: "สินทรัพย์หมุนเวียน" },
];

/**
 * สร้าง master data ตั้งต้นให้บริษัท ถ้ายังไม่เคยมี
 *
 * idempotent — เรียกซ้ำได้ไม่เกิดของซ้ำ เพราะเช็คจำนวนก่อนและใช้ skipDuplicates
 * ⚠️ ไม่ seed ทับถ้าบริษัทมีรายการอยู่แล้วแม้แต่รายการเดียว มิฉะนั้นรายการที่ผู้ใช้
 * ตั้งใจลบทิ้งจะถูกสร้างกลับมาทุกครั้งที่เปิดหน้า
 */
export async function ensureCompanyAssetMasterData(companyId: number): Promise<void> {
  const [categoryCount, accountCount] = await Promise.all([
    prisma.assetCategory.count({ where: { companyId } }),
    prisma.assetAccountType.count({ where: { companyId } }),
  ]);

  if (categoryCount === 0) {
    await prisma.assetCategory.createMany({
      data: DEFAULT_ASSET_CATEGORIES.map((c) => ({ ...c, companyId })),
      skipDuplicates: true,
    });
  }

  if (accountCount === 0) {
    await prisma.assetAccountType.createMany({
      data: DEFAULT_ACCOUNT_TYPES.map((a) => ({ ...a, companyId })),
      skipDuplicates: true,
    });
  }
}

/** อ่านจำนวนวันแจ้งเตือนของบริษัท (ยังไม่เคยตั้ง = 0 คือปิดการแจ้งเตือน) */
export async function getCompanyWarningDays(companyId: number): Promise<number> {
  const row = await prisma.assetCompanySettings.findUnique({ where: { companyId } });
  return row?.nearExpiryWarningDays ?? 0;
}
