// src/app/api/me/route.ts
// 🌟 ข้อมูลโปรไฟล์ของคนที่ล็อกอินอยู่ (ตัวเอง) ใช้กับการ์ดหัวหน้าจอฝั่ง user
// แยกออกมาจาก /api/employees/payslips เพราะบาง role (เช่น ASSET) ไม่ได้ยุ่งกับสลิปเงินเดือนเลย
// แต่ยังต้องรู้ว่าตัวเองเป็นใคร สังกัดบริษัทไหน
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employeeId = token.employeeId as string | undefined;

    // 🌟 [asset_redesign] บริษัทที่เข้าถึงได้ในโมดูล Asset (มาจาก membership ไม่ใช่ Employee)
    // บัญชีฝั่ง Asset จะไม่มี Employee ผูก จึงต้องดึงบริษัทจากตรงนี้แทน
    const memberships = token.id
      ? await prisma.assetCompanyMember.findMany({
          where: { userId: token.id as string },
          include: {
            company: { select: { id: true, companyName: true, logoUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const assetCompanies = memberships.map((m) => ({
      id: m.company.id,
      companyName: m.company.companyName,
      logoUrl: m.company.logoUrl,
      isOwner: m.isOwner,
    }));

    // ผู้ใช้บางคน (บัญชีฝั่ง Asset หรือ admin ที่สร้างจาก setup) ไม่มี employee record ผูกอยู่
    // กรณีนั้นคืน profile = null แล้วให้ UI ใช้ username/role/assetCompanies แทน
    const profile =
      employeeId && employeeId !== "undefined" && employeeId !== "null"
        ? await prisma.employee.findFirst({
            where: { id: { equals: employeeId, mode: "insensitive" } },
            include: { company: true },
          })
        : null;

    return NextResponse.json(
      {
        profile,
        username: (token as any).username || token.name || null,
        role: token.role || null,
        assetCompanies,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/me Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
