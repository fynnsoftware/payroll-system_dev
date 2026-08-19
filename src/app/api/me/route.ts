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

    // ผู้ใช้บางคน (เช่น admin ที่สร้างจาก setup) อาจไม่มี employee record ผูกอยู่
    // กรณีนั้นคืนเฉพาะข้อมูลจาก token ไปให้ UI แสดงเท่าที่มี
    if (!employeeId || employeeId === "undefined" || employeeId === "null") {
      return NextResponse.json(
        {
          profile: null,
          username: (token as any).username || token.name || null,
          role: token.role || null,
        },
        { status: 200 },
      );
    }

    const profile = await prisma.employee.findFirst({
      where: { id: { equals: employeeId, mode: "insensitive" } },
      include: { company: true },
    });

    return NextResponse.json(
      {
        profile,
        username: (token as any).username || token.name || null,
        role: token.role || null,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/me Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
