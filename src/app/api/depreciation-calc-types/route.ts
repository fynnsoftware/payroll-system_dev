// src/app/api/depreciation-calc-types/route.ts
// 🌟 [Phase 2 - Asset] master data "ประเภทการคำนวณค่าเสื่อมราคา" — แก้ได้ทั้งชื่อและเงื่อนไข/สูตร
// (เลือกจาก CONDITION_TYPE_OPTIONS / FORMULA_TYPE_OPTIONS ใน src/lib/depreciation.ts เท่านั้น
// ไม่รับสูตรอิสระ เพื่อความถูกต้องของตัวเลขทางบัญชี)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CALC_RULES, CONDITION_TYPE_OPTIONS, FORMULA_TYPE_OPTIONS } from "@/lib/depreciation";

export async function GET() {
  try {
    let types = await prisma.depreciationCalcType.findMany({ orderBy: { sortOrder: "asc" } });

    if (types.length === 0) {
      await prisma.depreciationCalcType.createMany({
        data: DEFAULT_CALC_RULES.map((r) => ({ ...r, isActive: true })),
        skipDuplicates: true,
      });
      types = await prisma.depreciationCalcType.findMany({ orderBy: { sortOrder: "asc" } });
    }

    return NextResponse.json(
      { types, conditionOptions: CONDITION_TYPE_OPTIONS, formulaOptions: FORMULA_TYPE_OPTIONS },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET DepreciationCalcType Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, label, conditionType, conditionDescription, formulaType, sortOrder } = body;

    if (!code || !label || !conditionType || !formulaType) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" }, { status: 400 });
    }

    const created = await prisma.depreciationCalcType.create({
      data: {
        code: String(code).trim(),
        label,
        conditionType,
        conditionDescription: conditionDescription || "",
        formulaType,
        sortOrder: sortOrder ?? 50,
        isDefault: false, // สร้างใหม่ผ่าน UI เป็น default ไม่ได้ ต้องมีแค่แถวเดียวที่ seed ไว้แต่แรก
      },
    });

    return NextResponse.json({ message: "เพิ่มประเภทการคำนวณสำเร็จ", data: created }, { status: 201 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "มี code นี้อยู่แล้ว" }, { status: 400 });
    }
    console.error("POST DepreciationCalcType Error:", error);
    return NextResponse.json({ error: "เพิ่มไม่สำเร็จ" }, { status: 500 });
  }
}
