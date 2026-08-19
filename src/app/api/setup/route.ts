// src/app/api/setup/route.ts
// 🌟 [security fix task #7] endpoint bootstrap สร้าง admin ทดสอบ — เดิมเปิดสาธารณะไม่มี auth เลย
// ใครก็ยิง GET เข้ามาสร้าง/เปิดใช้งานบัญชี admin (รหัสผ่าน password123) ได้ อันตรายมากถ้าอยู่บน prod
// แก้โดยล็อกด้วย SETUP_SECRET (env var) แทนการเช็ค token ผู้ใช้ เพราะ endpoint นี้มีไว้ bootstrap
// ตอนที่ยังไม่มี admin คนแรกในระบบเลย (เช็ค token ไม่ได้เพราะ chicken-and-egg problem)
// ต้องตั้งค่า SETUP_SECRET ใน .env ก่อนใช้งาน ถ้าไม่ตั้งไว้ endpoint นี้จะถูกปิดถาวร (ปลอดภัยไว้ก่อน)
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get("secret");
    if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hashedPassword = await bcrypt.hash("password123", 10);

    // 1. สร้าง Admin (รหัสผ่าน: password123)
    await prisma.user.upsert({
      where: { username: "admin" },
      update: {},
      create: {
        username: "admin",
        email: "admin@payroll.com",
        passwordHash: hashedPassword,
        role: "ADMIN",
      },
    });

    // 2. สร้างพนักงานทั่วไป (รหัสผ่าน: password123)
    await prisma.user.upsert({
      where: { username: "emp001" },
      update: {},
      create: {
        username: "emp001",
        email: "emp001@payroll.com",
        passwordHash: hashedPassword,
        role: "USER",
      },
    });

    return NextResponse.json({
      message: "สร้างบัญชี Admin และ พนักงาน ทดสอบสำเร็จ!",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "สร้างไม่สำเร็จ" }, { status: 500 });
  }
}
