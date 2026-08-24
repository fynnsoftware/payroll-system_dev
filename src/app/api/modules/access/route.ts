// src/app/api/modules/access/route.ts
// 🌟 [RBAC] เปิด/ปิดสิทธิ์ role ต่อ module — ใช้จากหน้า Settings > Role-Module Access
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";

// 🔒 [security] เดิมไม่มีการเช็คสิทธิ์เลย ใครก็ยิงเปลี่ยน RBAC matrix ให้ role ตัวเอง
// เข้าถึงทุก module ได้ — เป็นช่องยกระดับสิทธิ์ที่ร้ายแรงที่สุดในระบบ
export async function POST(request: NextRequest) {
  try {
    const { denied } = await guard(request, ["ADMIN"]);
    if (denied) return denied;

    const body = await request.json();
    const { role, moduleCode, allowed } = body;

    if (!role || !moduleCode || typeof allowed !== "boolean") {
      return NextResponse.json({ error: "กรุณาระบุ role, moduleCode และ allowed" }, { status: 400 });
    }

    const module_ = await prisma.module.findUnique({ where: { code: moduleCode } });
    if (!module_) return NextResponse.json({ error: "ไม่พบโมดูลนี้" }, { status: 404 });

    if (allowed) {
      await prisma.roleModuleAccess.upsert({
        where: { role_moduleId: { role, moduleId: module_.id } },
        update: {},
        create: { role, moduleId: module_.id },
      });
    } else {
      await prisma.roleModuleAccess.deleteMany({ where: { role, moduleId: module_.id } });
    }

    return NextResponse.json({ message: "อัปเดตสิทธิ์สำเร็จ" }, { status: 200 });
  } catch (error) {
    console.error("POST Module Access Error:", error);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}
