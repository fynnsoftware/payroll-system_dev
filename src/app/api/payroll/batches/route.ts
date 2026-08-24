// src/app/api/payroll/batches/route.ts
// 🔒 [security] เดิม endpoint นี้ไม่มีการเช็คสิทธิ์เลย ใครยิงก็ได้ข้อมูลรอบเงินเดือนทุกบริษัท
// ตอนนี้: ต้องล็อกอิน + เป็น ADMIN หรือ HR เท่านั้น และ HR เห็นได้เฉพาะบริษัทในเครือของตัวเอง
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { getAllowedCompanyIds } from "@/lib/companyScope";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");

  try {
    const token = await getToken({ req: request });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = token.role as string;
    if (role !== "ADMIN" && role !== "HR") {
      return NextResponse.json(
        { error: "Access Denied: เฉพาะ ADMIN และ HR เท่านั้น" },
        { status: 403 },
      );
    }

    const allowedCompanyIds = await getAllowedCompanyIds(token);

    const where: any = {};
    if (year) where.year = parseInt(year);
    if (allowedCompanyIds !== null) {
      where.companyId = {
        in: allowedCompanyIds.length > 0 ? allowedCompanyIds : [-1],
      };
    }

    // ดึงข้อมูล Batch ตามปีที่เลือก (หรือดึงทั้งหมดถ้าไม่ได้ส่งปีมา)
    const batches = await prisma.payrollImportBatch.findMany({
      where,
      orderBy: { month: "desc" }, // เรียงเดือนล่าสุดขึ้นก่อน
      include: {
        records: true, // ดึงรายละเอียดของพนักงานแต่ละคนมาด้วย
      },
    });

    return NextResponse.json(batches, { status: 200 });
  } catch (error: any) {
    console.error("Fetch Batches Error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถดึงข้อมูลสรุปได้" },
      { status: 500 },
    );
  }
}
