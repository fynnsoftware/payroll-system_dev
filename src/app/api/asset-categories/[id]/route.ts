// src/app/api/asset-categories/[id]/route.ts
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";

// 🔒 [security] แก้/ลบ master data ได้เฉพาะ ADMIN และ ASSET
// ⚠️ เป็นข้อมูลกลางของทั้งระบบ การแก้ชื่อมีผลกับทุกบริษัทที่ใช้ประเภทนั้นอยู่
// ส่วนการลบมี FK กันไว้อีกชั้น ลบได้เฉพาะประเภทที่ยังไม่มีทรัพย์สินผูกอยู่ (ดักเป็น P2003)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { denied } = await guard(request, ["ADMIN", "ASSET"]);
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const name = (body.name as string)?.trim();
    if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อประเภททรัพย์สิน" }, { status: 400 });

    const updated = await prisma.assetCategory.update({ where: { id: Number(id) }, data: { name } });
    return NextResponse.json({ message: "อัปเดตสำเร็จ", data: updated }, { status: 200 });
  } catch (error: any) {
    if (error.code === "P2002") return NextResponse.json({ error: "มีประเภททรัพย์สินนี้อยู่แล้ว" }, { status: 400 });
    console.error("PUT AssetCategory Error:", error);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { denied } = await guard(request, ["ADMIN", "ASSET"]);
    if (denied) return denied;

    const { id } = await params;
    await prisma.assetCategory.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: "ลบสำเร็จ" }, { status: 200 });
  } catch (error: any) {
    if (error.code === "P2003") {
      return NextResponse.json({ error: "ไม่สามารถลบได้ เนื่องจากมีทรัพย์สินใช้ประเภทนี้อยู่" }, { status: 400 });
    }
    console.error("DELETE AssetCategory Error:", error);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
