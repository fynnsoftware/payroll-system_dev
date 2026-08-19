// src/lib/companyScope.ts
// 🌟 [security] ขอบเขตบริษัทที่ user คนหนึ่งมีสิทธิ์เห็น — ใช้กฎเดียวกันทุก API เพื่อไม่ให้ข้อมูลข้ามบริษัท
//
// กฎ:
//   ADMIN            -> เห็นทุกบริษัท (คืน null = ไม่จำกัด)
//   อยู่บริษัท Primary -> เห็นบริษัทตัวเอง + sub-company ทั้งหมดในเครือ
//   อยู่บริษัท Sub     -> เห็นเฉพาะบริษัทตัวเองเท่านั้น
import { prisma } from "@/lib/prisma";

/**
 * คืน array ของ companyId ที่ user คนนี้เข้าถึงได้
 * - คืน null แปลว่า "ไม่จำกัด" (ADMIN)
 * - คืน [] แปลว่า "ไม่มีสิทธิ์เห็นอะไรเลย" (หาบริษัทต้นสังกัดไม่เจอ)
 */
export async function getAllowedCompanyIds(token: any): Promise<number[] | null> {
  if (!token) return [];
  if (token.role === "ADMIN") return null; // ไม่จำกัด

  // หา companyId ต้นสังกัด — เอาจาก token ก่อน ถ้าไม่มีค่อยย้อนไปดูจาก employee record
  let companyId: number | null = token.companyId ? Number(token.companyId) : null;

  if (!companyId && token.employeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: token.employeeId as string },
      select: { currentCompanyId: true },
    });
    companyId = emp?.currentCompanyId ?? null;
  }

  if (!companyId) return [];

  const own = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, parentId: true },
  });
  if (!own) return [];

  // อยู่บริษัทลูก -> เห็นแค่ตัวเอง
  if (own.parentId) return [own.id];

  // อยู่บริษัทแม่ -> เห็นตัวเอง + ลูกทั้งหมด
  const subs = await prisma.company.findMany({
    where: { parentId: own.id },
    select: { id: true },
  });
  return [own.id, ...subs.map((s) => s.id)];
}

/** เช็คว่า user มีสิทธิ์กับบริษัทนี้ไหม (ใช้ก่อนสร้าง/แก้ไข/ลบข้อมูลที่ผูกกับบริษัท) */
export function isCompanyAllowed(
  allowedIds: number[] | null,
  companyId: number,
): boolean {
  if (allowedIds === null) return true; // ADMIN
  return allowedIds.includes(companyId);
}
