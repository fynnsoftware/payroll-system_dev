// src/app/api/asset-accounts/route.ts
// 🌟 [asset_redesign] บัญชีเข้าระบบ Asset — User ที่ไม่มี Employee ผูก
//
// ทำไมแยกจาก /api/employees: หน้า People Mgt สร้าง Employee เสมอ (currentCompanyId บังคับ)
// แต่บัญชีฝั่ง Asset ไม่ใช่พนักงานในระบบ payroll จึงสร้างแค่ User แล้วเชื่อมกับบริษัท
// ผ่าน AssetCompanyMember แทน — ADMIN เท่านั้นที่จัดการส่วนนี้ได้
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { guard } from "@/lib/apiGuard";

// ==========================================
// 🟢 GET: รายชื่อบัญชี Asset ทั้งหมด พร้อมบริษัทที่เข้าถึงได้
// ==========================================
export async function GET(request: NextRequest) {
  try {
    const { denied } = await guard(request, ["ADMIN"]);
    if (denied) return denied;

    const accounts = await prisma.user.findMany({
      where: { role: "ASSET" },
      include: {
        assetMemberships: {
          include: { company: { select: { id: true, companyName: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = accounts.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      isActive: u.isActive,
      createdAt: u.createdAt,
      companies: u.assetMemberships.map((m) => ({
        companyId: m.company.id,
        companyName: m.company.companyName,
        isOwner: m.isOwner,
      })),
    }));

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("GET AssetAccounts Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลบัญชีไม่สำเร็จ" }, { status: 500 });
  }
}

// ==========================================
// 🔵 POST: สร้างบัญชีเข้าระบบ Asset ใหม่
// ==========================================
export async function POST(request: NextRequest) {
  try {
    const { denied } = await guard(request, ["ADMIN"]);
    if (denied) return denied;

    const body = await request.json();
    const username = (body.username as string)?.trim();
    const password = body.password as string;
    const email = (body.email as string)?.trim() || null;

    if (!username || !password) {
      return NextResponse.json(
        { error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน" },
        { status: 400 },
      );
    }

    // เช็คชื่อซ้ำก่อน เพื่อให้ข้อความชัดว่าอะไรซ้ำ (P2002 ไม่บอกว่าเป็น username หรือ email)
    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      return NextResponse.json(
        { error: `ชื่อผู้ใช้ "${username}" ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น` },
        { status: 400 },
      );
    }
    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        return NextResponse.json(
          { error: `อีเมล "${email}" ถูกใช้งานแล้ว` },
          { status: 400 },
        );
      }
    }

    const created = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "ASSET",
        isActive: true,
      },
    });

    return NextResponse.json(
      {
        message: "สร้างบัญชีสำเร็จ!",
        data: { id: created.id, username: created.username },
      },
      { status: 201 },
    );
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว" },
        { status: 400 },
      );
    }
    console.error("POST AssetAccount Error:", error);
    return NextResponse.json({ error: "สร้างบัญชีไม่สำเร็จ" }, { status: 500 });
  }
}
