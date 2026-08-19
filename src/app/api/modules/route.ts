// src/app/api/modules/route.ts
// 🌟 [RBAC] Module + Role access matrix — ใช้แทน allowedRoles hardcode ใน layout.tsx
// GET คืนทั้งรายการ module และ access matrix ปัจจุบัน (lazy-seed ถ้ายังไม่มี)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
// 🌟 ใช้นิยาม module ชุดเดียวกับฝั่ง company (source of truth เดียว กัน seed ไม่ตรงกัน)
import { DEFAULT_MODULES, ensureModulesSeeded } from "@/lib/companyModules";

// role เริ่มต้นที่เข้าแต่ละ module ได้ — ADMIN เข้าได้ทุกโมดูลเสมอ (ไม่ผ่าน matrix นี้ เช็คแยกในโค้ด)
const DEFAULT_ACCESS: { role: string; moduleCode: string }[] = [
  { role: "HR", moduleCode: "HR" },
  { role: "ASSET", moduleCode: "ASSET" },
];

export async function GET() {
  try {
    // 🌟 การันตีว่ามีแถว master ครบและชื่อตรงกับ branding ปัจจุบันเสมอ (idempotent)
    await ensureModulesSeeded();
    const modules = await prisma.module.findMany({ orderBy: { sortOrder: "asc" } });

    // 🐛 [bug] เดิม seed access matrix เฉพาะตอน Module ยังว่าง — แต่ตอนนี้ Module อาจถูก seed
    // จากฝั่งบันทึก company ไปก่อนแล้ว ทำให้ matrix ไม่เคยถูก seed เลย เปลี่ยนมาเช็คที่ตาราง access ตรงๆ แทน
    let accessRows = await prisma.roleModuleAccess.findMany();
    if (accessRows.length === 0) {
      const moduleIdByCode = new Map(modules.map((m) => [m.code, m.id]));
      await prisma.roleModuleAccess.createMany({
        data: DEFAULT_ACCESS.map((a) => ({ role: a.role, moduleId: moduleIdByCode.get(a.moduleCode)! })),
        skipDuplicates: true,
      });
      accessRows = await prisma.roleModuleAccess.findMany();
    }
    const moduleById = new Map(modules.map((m) => [m.id, m.code]));
    const accessMatrix = accessRows.map((a) => ({ role: a.role, moduleCode: moduleById.get(a.moduleId) }));

    return NextResponse.json({ modules, accessMatrix }, { status: 200 });
  } catch (error) {
    console.error("GET Modules Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
