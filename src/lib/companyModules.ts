// src/lib/companyModules.ts
// 🌟 [module_company] helper สำหรับจัดการว่าบริษัทไหนเปิดใช้ module ไหนบ้าง (Payroll / Assessment)
// ใช้ร่วมกันระหว่าง POST (สร้างบริษัท) และ PUT (แก้ไขบริษัท)
import { prisma } from "@/lib/prisma";

// code คงเดิม (HR/ASSET) เพื่อไม่ให้ข้อมูลเดิมพัง — ชื่อที่แสดงคือ Payroll / Assessment
export const MODULE_CODES = ["HR", "ASSET"] as const;

/**
 * แปลงค่าที่ส่งมาจากฟอร์ม (JSON string เช่น '["HR","ASSET"]') ให้เป็น array ของ code ที่ valid เท่านั้น
 * ถ้าไม่ได้ส่งมาเลย จะคืน null เพื่อให้ผู้เรียกรู้ว่า "ไม่ได้ตั้งใจแก้ module" (ไม่ใช่ "ตั้งใจเอาออกทั้งหมด")
 */
export function parseModuleCodes(raw: string | null): string[] | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((code: unknown): code is string =>
      typeof code === "string" && (MODULE_CODES as readonly string[]).includes(code),
    );
  } catch {
    return [];
  }
}

// 🌟 [module_company] role ไหนต้องการ module อะไร (ADMIN ไม่ผูกกับ module แต่ผูกกับสิทธิ์คนสร้างแทน)
const ROLE_REQUIRED_MODULE: Record<string, string> = {
  USER: "HR",
  HR: "HR",
  ASSET: "ASSET",
};

/**
 * ดึง module code ของบริษัท ถ้าเป็น sub-company ที่ยังไม่ได้ตั้ง module เอง จะ fallback ไปดูของบริษัทแม่
 */
export async function getCompanyModuleCodes(companyId: number): Promise<string[]> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { parentId: true, moduleLinks: { select: { module: { select: { code: true } } } } },
  });
  if (!company) return [];

  const own = company.moduleLinks.map((link) => link.module.code);
  if (own.length > 0) return own;

  if (company.parentId) {
    const parent = await prisma.company.findUnique({
      where: { id: company.parentId },
      select: { moduleLinks: { select: { module: { select: { code: true } } } } },
    });
    return parent?.moduleLinks.map((link) => link.module.code) || [];
  }
  return [];
}

/**
 * ตรวจสอบว่า role ที่จะตั้งให้พนักงาน ใช้ได้กับ module ของบริษัทนั้นหรือไม่
 * และ ADMIN ต้องถูกสร้างโดยคนที่เป็น ADMIN เท่านั้น
 * คืน error message ถ้าไม่ผ่าน / คืน null ถ้าผ่าน
 */
export async function validateRoleForCompany(
  role: string,
  companyId: number,
  actorRole: string,
): Promise<string | null> {
  const normalized = (role || "").toUpperCase();

  if (normalized === "ADMIN") {
    return actorRole === "ADMIN"
      ? null
      : "Access Denied: เฉพาะ ADMIN เท่านั้นที่สร้าง/แก้ไขบัญชีระดับ ADMIN ได้";
  }

  const required = ROLE_REQUIRED_MODULE[normalized];
  if (!required) return "สิทธิ์ที่เลือกไม่ถูกต้อง";

  const codes = await getCompanyModuleCodes(companyId);
  if (!codes.includes(required)) {
    const label = required === "HR" ? "Payroll" : "Assessment";
    return `บริษัทนี้ยังไม่ได้เปิดใช้ module ${label} จึงตั้งสิทธิ์ ${normalized} ไม่ได้`;
  }
  return null;
}

/**
 * ตั้งค่า module ของบริษัทให้ตรงกับรายการที่ส่งมา (เพิ่มอันที่ขาด ลบอันที่ไม่ได้ติ๊กแล้ว)
 * ถ้า moduleCodes เป็น null จะไม่แตะข้อมูลเดิมเลย
 */
export async function syncCompanyModules(
  companyId: number,
  moduleCodes: string[] | null,
): Promise<void> {
  if (moduleCodes === null) return;

  const modules = await prisma.module.findMany({
    where: { code: { in: moduleCodes } },
    select: { id: true },
  });
  const targetModuleIds = modules.map((m) => m.id);

  // ลบ link ที่ไม่ได้ติ๊กแล้วออก
  await prisma.companyModule.deleteMany({
    where: { companyId, moduleId: { notIn: targetModuleIds.length > 0 ? targetModuleIds : [-1] } },
  });

  // เพิ่ม link ใหม่ (skipDuplicates กัน unique constraint ชน)
  if (targetModuleIds.length > 0) {
    await prisma.companyModule.createMany({
      data: targetModuleIds.map((moduleId) => ({ companyId, moduleId })),
      skipDuplicates: true,
    });
  }
}
