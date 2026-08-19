// src/app/api/modules/route.ts
// 🌟 [RBAC] Module + Role access matrix — ใช้แทน allowedRoles hardcode ใน layout.tsx
// GET คืนทั้งรายการ module และ access matrix ปัจจุบัน (lazy-seed ถ้ายังไม่มี)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_MODULES = [
  { code: "HR", name: "HR", sortOrder: 1 },
  { code: "ASSET", name: "Assetment", sortOrder: 2 },
];

// role เริ่มต้นที่เข้าแต่ละ module ได้ — ADMIN เข้าได้ทุกโมดูลเสมอ (ไม่ผ่าน matrix นี้ เช็คแยกในโค้ด)
const DEFAULT_ACCESS: { role: string; moduleCode: string }[] = [
  { role: "HR", moduleCode: "HR" },
  { role: "ASSET", moduleCode: "ASSET" },
];

export async function GET() {
  try {
    let modules = await prisma.module.findMany({ orderBy: { sortOrder: "asc" } });

    if (modules.length === 0) {
      await prisma.module.createMany({ data: DEFAULT_MODULES, skipDuplicates: true });
      modules = await prisma.module.findMany({ orderBy: { sortOrder: "asc" } });

      const moduleIdByCode = new Map(modules.map((m) => [m.code, m.id]));
      await prisma.roleModuleAccess.createMany({
        data: DEFAULT_ACCESS.map((a) => ({ role: a.role, moduleId: moduleIdByCode.get(a.moduleCode)! })),
        skipDuplicates: true,
      });
    }

    const accessRows = await prisma.roleModuleAccess.findMany();
    const moduleById = new Map(modules.map((m) => [m.id, m.code]));
    const accessMatrix = accessRows.map((a) => ({ role: a.role, moduleCode: moduleById.get(a.moduleId) }));

    return NextResponse.json({ modules, accessMatrix }, { status: 200 });
  } catch (error) {
    console.error("GET Modules Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
