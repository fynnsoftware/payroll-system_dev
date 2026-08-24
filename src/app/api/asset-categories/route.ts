// src/app/api/asset-categories/route.ts
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";

// 🔒 [security] เดิมไม่มีการเช็คสิทธิ์เลย ใครก็เพิ่ม/แก้ master data ได้
// อ่าน: ทุก role ที่ล็อกอินแล้ว (ฟอร์มทรัพย์สินต้องใช้ทำ dropdown)
// เขียน: ADMIN เท่านั้น (หน้า Settings ที่จัดการ master data อยู่ในโซน /admin)

// 🌟 [Phase 2 - Asset] ประเภททรัพย์สิน — seed 4 กลุ่มตาม template เดิมแบบ lazy (ครั้งแรกที่เรียก GET ถ้าตารางว่าง)
// รอ user confirm (phase2asset_#27) ว่าจะให้ตายตัวหรือแก้ไขเองได้ — ตอนนี้เปิด POST ไว้ให้เพิ่มได้
// เผื่อคำตอบออกมาเป็น "แก้ไขได้" จะได้ไม่ต้องแก้ backend เพิ่ม แค่เปิด UI ให้ admin เรียกใช้
const DEFAULT_CATEGORIES = [
  "เครื่องใช้สำนักงาน",
  "เครื่องจักรและอุปกรณ์",
  "ยานพาหนะ",
  "อาคาร",
];

export async function GET(request: NextRequest) {
  try {
    const { denied } = await guard(request);
    if (denied) return denied;

    let categories = await prisma.assetCategory.findMany({ orderBy: { id: "asc" } });

    if (categories.length === 0) {
      await prisma.assetCategory.createMany({
        data: DEFAULT_CATEGORIES.map((name) => ({ name })),
        skipDuplicates: true,
      });
      categories = await prisma.assetCategory.findMany({ orderBy: { id: "asc" } });
    }

    return NextResponse.json(categories, { status: 200 });
  } catch (error) {
    console.error("GET AssetCategory Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลประเภททรัพย์สินไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { denied } = await guard(request, ["ADMIN"]);
    if (denied) return denied;

    const body = await request.json();
    const name = (body.name as string)?.trim();
    if (!name) {
      return NextResponse.json({ error: "กรุณาระบุชื่อประเภททรัพย์สิน" }, { status: 400 });
    }
    const category = await prisma.assetCategory.create({ data: { name } });
    return NextResponse.json({ message: "เพิ่มประเภททรัพย์สินสำเร็จ", data: category }, { status: 201 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "มีประเภททรัพย์สินนี้อยู่แล้ว" }, { status: 400 });
    }
    return NextResponse.json({ error: "เพิ่มประเภททรัพย์สินไม่สำเร็จ" }, { status: 500 });
  }
}
