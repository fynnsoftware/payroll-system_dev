// src/app/api/assets/[id]/route.ts
// 🔒 [asset_redesign] ทุก method ต้องเช็คว่าทรัพย์สินชิ้นนี้อยู่ในบริษัทที่ user มีสิทธิ์
// (กฎกลางอยู่ที่ src/lib/assetScope.ts — membership + module ของบริษัท)
// กันการเดา id แล้วดู/แก้/ลบข้ามบริษัท
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { getAssetCompanyIds, isAssetCompanyAllowed, explainAssetAccessDenied } from "@/lib/assetScope";

/**
 * เช็คสิทธิ์กับทรัพย์สินชิ้นหนึ่ง — คืน error response ถ้าไม่ผ่าน, คืน null ถ้าผ่าน
 */
async function guardAssetAccess(request: NextRequest, assetId: string) {
  const token = await getToken({ req: request });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { companyId: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "ไม่พบทรัพย์สินนี้" }, { status: 404 });
  }

  const allowed = await getAssetCompanyIds(token);
  if (!isAssetCompanyAllowed(allowed, asset.companyId)) {
    // ตอบ 404 แทน 403 เพื่อไม่ให้รู้ว่ามีทรัพย์สิน id นี้อยู่จริงในบริษัทอื่น
    return NextResponse.json({ error: "ไม่พบทรัพย์สินนี้" }, { status: 404 });
  }
  return null;
}

// 🟢 GET: ดูรายละเอียดทรัพย์สินรายตัว
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const denied = await guardAssetAccess(request, id);
    if (denied) return denied;

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const denied = await guardAssetAccess(request, id);
    if (denied) return denied;

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

    // 🔒 ถ้ามีการย้ายบริษัท ต้องเช็คว่าบริษัทปลายทางอยู่ในขอบเขตของ user ด้วย
    // (ไม่งั้นจะย้ายทรัพย์สินไปซุกบริษัทอื่นที่ตัวเองไม่มีสิทธิ์ได้)
    if (companyId !== undefined) {
      const token = await getToken({ req: request });
      const allowed = await getAssetCompanyIds(token);
      if (!isAssetCompanyAllowed(allowed, Number(companyId))) {
        const reason = await explainAssetAccessDenied(token, Number(companyId));
        return NextResponse.json(
          { error: `ย้ายทรัพย์สินไปบริษัทนี้ไม่ได้: ${reason}` },
          { status: 403 },
        );
      }
    }

    // 🐛 [bug] ถ้าแก้ "ตัวตั้งต้นของการคำนวณ" (ราคาทุน / อัตราค่าเสื่อม / วันที่ซื้อ / ยอดยกมา)
    // ต้องล้างประวัติปิดงวดเดิมทิ้ง แล้วให้ระบบคำนวณใหม่
    //
    // อาการที่เจอ: สร้างทรัพย์สินด้วยวันที่ซื้อปี 2015 -> ระบบปิดงวดปี 2015-2025 ให้อัตโนมัติ
    // และบันทึกว่าเสื่อมครบแล้ว (accumDeprCF = ราคาทุน - 1) พอแก้วันที่ซื้อเป็นปี 2026
    // ตัวคำนวณยังไปหยิบยอดยกมาจากแถวปิดงวดปี 2025 เดิมมาใช้ ทำให้ NBV = 1 ค้างอยู่
    // และขึ้น badge "หมดอายุ" ทั้งที่เพิ่งซื้อ
    //
    // เดิมตั้งใจให้แถวปิดงวด immutable แต่มันสมเหตุสมผลเฉพาะตอนที่ "ข้อมูลตั้งต้นไม่เปลี่ยน"
    // พอตัวตั้งต้นเปลี่ยน ประวัติที่คำนวณจากของเก่าก็ผิดไปด้วย ต้องสร้างใหม่ทั้งชุด
    // (ปลอดภัยเพราะแถวพวกนี้ระบบสร้างเองอัตโนมัติ closedBy = "SYSTEM (Auto)" ไม่ใช่ที่คนอนุมัติ)
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (existing) {
      const changedCalcBasis =
        (cost !== undefined && Number(cost) !== Number(existing.cost)) ||
        (depreciationRate !== undefined &&
          Number(depreciationRate) !== Number(existing.depreciationRate)) ||
        (purchaseDate !== undefined &&
          new Date(purchaseDate).getTime() !== existing.purchaseDate.getTime()) ||
        (openingAccumDepr !== undefined &&
          Number(openingAccumDepr || 0) !== Number(existing.openingAccumDepr || 0)) ||
        (openingAsOfDate !== undefined &&
          (openingAsOfDate ? new Date(openingAsOfDate).getTime() : null) !==
            (existing.openingAsOfDate ? existing.openingAsOfDate.getTime() : null));

      if (changedCalcBasis) {
        await prisma.assetYearlyClose.deleteMany({ where: { assetId: id } });
      }
    }

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const denied = await guardAssetAccess(request, id);
    if (denied) return denied;

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const denied = await guardAssetAccess(request, id);
    if (denied) return denied;

    await prisma.asset.delete({ where: { id } });
    return NextResponse.json({ message: "ลบทรัพย์สินสำเร็จ" }, { status: 200 });
  } catch (error) {
    console.error("DELETE Asset Error:", error);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
