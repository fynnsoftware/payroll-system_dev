// src/app/api/assets/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 🟢 GET: ดูรายละเอียดทรัพย์สินรายตัว
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: { company: true, category: true },
    });
    if (!asset) return NextResponse.json({ error: "ไม่พบทรัพย์สินนี้" }, { status: 404 });
    return NextResponse.json(asset, { status: 200 });
  } catch (error) {
    console.error("GET Asset Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

// 🟡 PUT: แก้ไขทรัพย์สิน
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      assetCode,
      companyId,
      categoryId,
      description,
      location,
      cost,
      depreciationRate,
      purchaseDate,
      openingAccumDepr,
      openingAsOfDate,
    } = body;

    // ⚠️ ข้อควรระวัง: ถ้าทรัพย์สินตัวนี้เคยถูกปิดงวด (AssetYearlyClose) ไปแล้ว การแก้ cost/rate/
    // purchaseDate/openingAccumDepr ตรงนี้จะไม่ retroactive ไปแก้ตัวเลขปีที่ปิดไปแล้ว (ตามหลัก
    // immutable) แต่จะกระทบแค่การคำนวณปีถัดจากปีที่ปิดล่าสุดเป็นต้นไป ยังไม่ได้ทำ UI เตือนจุดนี้
    const updated = await prisma.asset.update({
      where: { id },
      data: {
        assetCode: assetCode ? String(assetCode).trim() : undefined,
        companyId: companyId ? Number(companyId) : undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        description,
        location: location || null,
        cost: cost !== undefined ? Number(cost) : undefined,
        depreciationRate: depreciationRate !== undefined ? Number(depreciationRate) : undefined,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        openingAccumDepr: openingAccumDepr !== undefined ? (openingAccumDepr === "" || openingAccumDepr === null ? null : Number(openingAccumDepr)) : undefined,
        openingAsOfDate: openingAsOfDate !== undefined ? (openingAsOfDate ? new Date(openingAsOfDate) : null) : undefined,
      },
    });

    return NextResponse.json({ message: "อัปเดตทรัพย์สินสำเร็จ", data: updated }, { status: 200 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "รหัสทรัพย์สินนี้มีอยู่ในระบบแล้ว" }, { status: 400 });
    }
    console.error("PUT Asset Error:", error);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}

// 🟠 PATCH: Terminate / Reactivate ทรัพย์สิน (soft-deactivate)
// 🌟 [Phase 2 - Asset task #17] confirm แล้วว่าไม่ต้องมี reason/effective date เก็บแค่ terminatedAt พอ
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const isActive = body.isActive !== false;

    const updated = await prisma.asset.update({
      where: { id },
      data: { isActive, terminatedAt: isActive ? null : new Date() },
    });

    return NextResponse.json(
      { message: isActive ? "เปิดใช้งานทรัพย์สินอีกครั้งแล้ว" : "Terminate ทรัพย์สินเรียบร้อยแล้ว", data: updated },
      { status: 200 },
    );
  } catch (error) {
    console.error("PATCH (terminate) Asset Error:", error);
    return NextResponse.json({ error: "ดำเนินการไม่สำเร็จ" }, { status: 500 });
  }
}

// 🔴 DELETE: ลบทรัพย์สินถาวร (ใช้น้อย ปกติควรใช้ Terminate แทน)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.asset.delete({ where: { id } });
    return NextResponse.json({ message: "ลบทรัพย์สินสำเร็จ" }, { status: 200 });
  } catch (error) {
    console.error("DELETE Asset Error:", error);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
