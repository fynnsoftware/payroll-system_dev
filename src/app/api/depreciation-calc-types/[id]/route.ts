// src/app/api/depreciation-calc-types/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 🟡 PUT: แก้ label / เงื่อนไข / สูตร / ลำดับ / เปิดปิดใช้งาน
// (isDefault แก้ไม่ได้ผ่าน endpoint นี้ — ต้องมีแถว default เดิมเสมอเพื่อกัน engine ไม่มี fallback)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { label, conditionType, conditionDescription, formulaType, sortOrder, isActive } = body;

    const existing = await prisma.depreciationCalcType.findUnique({ where: { id: Number(id) } });
    if (!existing) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

    if (existing.isDefault && isActive === false) {
      return NextResponse.json({ error: "ปิดการใช้งานแถว default ไม่ได้ ต้องมี fallback เสมอ" }, { status: 400 });
    }

    const updated = await prisma.depreciationCalcType.update({
      where: { id: Number(id) },
      data: {
        label,
        conditionType: existing.isDefault ? existing.conditionType : (conditionType ?? existing.conditionType),
        conditionDescription,
        formulaType: formulaType ?? existing.formulaType,
        sortOrder: sortOrder ?? existing.sortOrder,
        isActive: isActive ?? existing.isActive,
      },
    });

    return NextResponse.json({ message: "อัปเดตสำเร็จ", data: updated }, { status: 200 });
  } catch (error) {
    console.error("PUT DepreciationCalcType Error:", error);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}

// 🔴 DELETE: ลบได้เฉพาะ rule ที่ไม่ใช่ default
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.depreciationCalcType.findUnique({ where: { id: Number(id) } });
    if (!existing) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
    if (existing.isDefault) {
      return NextResponse.json({ error: "ลบแถว default ไม่ได้ (engine ต้องมี fallback เสมอ)" }, { status: 400 });
    }

    await prisma.depreciationCalcType.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: "ลบสำเร็จ" }, { status: 200 });
  } catch (error) {
    console.error("DELETE DepreciationCalcType Error:", error);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
