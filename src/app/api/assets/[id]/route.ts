// src/app/api/assets/[id]/route.ts
// 🔒 [asset_redesign] ทุก method ต้องเช็คว่าทรัพย์สินชิ้นนี้อยู่ในบริษัทที่ user มีสิทธิ์
// (กฎกลางอยู่ที่ src/lib/assetScope.ts — membership + module ของบริษัท)
// กันการเดา id แล้วดู/แก้/ลบข้ามบริษัท
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { getAssetCompanyIds, isAssetCompanyAllowed, explainAssetAccessDenied } from "@/lib/assetScope";
import { validateOpeningBalance, resolveOpeningBalance } from "@/lib/assetValidation";
import { getGroupRootId } from "@/lib/companyGroup";

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

    // 🔒 [validation] ตรวจยอดยกมาโดยรวมค่าเดิมกับค่าใหม่เข้าด้วยกันก่อน
    // เพราะ PUT อาจส่งมาแค่บางฟิลด์ ถ้าตรวจเฉพาะที่ส่งมาจะพลาดเคสที่แก้วันที่ซื้อ
    // แล้วไปขัดกับยอดยกมาเดิมที่ค้างอยู่ในฐานข้อมูล
    const before = await prisma.asset.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ error: "ไม่พบทรัพย์สินนี้" }, { status: 404 });

    // 🔒 [asset_code] รหัสทรัพย์สินแก้ไม่ได้หลังสร้างแล้ว
    //
    // เหตุผล: รหัสนี้ถูกพิมพ์ติดไว้บนตัวทรัพย์สินจริง (สติกเกอร์/ป้าย) และถูกอ้างอิง
    // ในเอกสารบัญชี ใบตรวจนับ และไฟล์ที่ export ออกไปแล้ว การแก้ทีหลังทำให้ของจริง
    // กับในระบบไม่ตรงกันโดยไม่มีร่องรอย ตามย้อนหลังไม่ได้ว่าเคยเป็นรหัสอะไร
    //
    // ⚠️ ต้องกันที่ API ด้วย ไม่ใช่แค่ disable ช่องกรอก เพราะยิง API ตรงๆ ข้าม UI ได้
    if (assetCode !== undefined && String(assetCode).trim() !== before.assetCode) {
      return NextResponse.json(
        { error: "แก้ไขรหัสทรัพย์สินไม่ได้ เพราะถูกอ้างอิงในเอกสารและป้ายทรัพย์สินแล้ว" },
        { status: 400 },
      );
    }

    // 🔒 [per_company] ประเภทต้องเป็นของบริษัทปลายทาง (บริษัทใหม่ถ้าย้าย ไม่งั้นบริษัทเดิม)
    // เช็คทุกครั้งที่มีการส่ง categoryId หรือ companyId มา เพราะย้ายบริษัทอย่างเดียว
    // ก็ทำให้ประเภทเดิมกลายเป็นของคนละบริษัททันที
    if (categoryId !== undefined || companyId !== undefined) {
      const targetCompanyId = companyId !== undefined ? Number(companyId) : before.companyId;
      const targetCategoryId = categoryId !== undefined ? Number(categoryId) : before.categoryId;
      const category = await prisma.assetCategory.findUnique({ where: { id: targetCategoryId } });
      if (!category || category.companyId !== targetCompanyId) {
        return NextResponse.json(
          { error: "ประเภททรัพย์สินที่เลือกไม่ได้อยู่ในบริษัทนี้ กรุณาเลือกประเภทใหม่" },
          { status: 400 },
        );
      }
    }

    // 🌟 [group_dup] ย้ายทรัพย์สินข้ามบริษัท = อาจย้ายข้ามเครือด้วย ต้องคำนวณต้นเครือใหม่
    //
    // ⚠️ ถ้าไม่ทำ groupRootId จะค้างเป็นของเครือเดิม แล้ว unique constraint จะบังคับผิดเครือ
    // (ปล่อยให้รหัสซ้ำในเครือใหม่ได้ ทั้งที่ควรกัน และไปกันรหัสในเครือเก่าที่ไม่เกี่ยวแล้ว)
    //
    // ⚠️ ต้องเช็คด้วยว่ารหัสเดิมไปชนกับของเครือใหม่หรือไม่ — รหัสแก้ไม่ได้ ย้ายแล้วชนจึงแก้ไม่ตก
    // ต้องบอกให้ชัดตั้งแต่ตอนนี้ว่าย้ายไม่ได้ แทนที่จะปล่อยให้ DB เด้ง unique ดิบๆ
    let nextGroupRootId: number | undefined;
    if (companyId !== undefined && Number(companyId) !== before.companyId) {
      nextGroupRootId = await getGroupRootId(Number(companyId));
      if (nextGroupRootId !== before.groupRootId) {
        const clash = await prisma.asset.findFirst({
          where: { groupRootId: nextGroupRootId, assetCode: before.assetCode, id: { not: id } },
          select: { company: { select: { companyName: true } } },
        });
        if (clash) {
          return NextResponse.json(
            {
              error:
                `ย้ายไม่ได้ เพราะรหัส "${before.assetCode}" ถูกใช้อยู่แล้วในเครือบริษัทปลายทาง` +
                (clash.company ? ` (${clash.company.companyName})` : "") +
                " — รหัสทรัพย์สินแก้ไม่ได้ จึงต้องแก้ที่ปลายทางก่อน",
            },
            { status: 400 },
          );
        }
      }
    }

    // 🌟 [opening_fix] รวมค่าใหม่กับค่าเดิมแล้ว normalize ครั้งเดียว
    // ใช้ผลลัพธ์ชุดนี้ทั้งตอนตรวจ ตอนเทียบว่าฐานคำนวณเปลี่ยนไหม และตอนบันทึก
    // จะได้ไม่มีทางที่สามจุดนี้ตีความค่าเดียวกันคนละแบบอีก
    const opening = resolveOpeningBalance(
      openingAccumDepr !== undefined ? openingAccumDepr : before.openingAccumDepr,
      openingAsOfDate !== undefined ? openingAsOfDate : before.openingAsOfDate,
    );

    const openingError = validateOpeningBalance({
      cost: cost !== undefined ? Number(cost) : Number(before.cost),
      purchaseDate: purchaseDate ? new Date(purchaseDate) : before.purchaseDate,
      openingAccumDepr: opening.openingAccumDepr,
      openingAsOfDate: opening.openingAsOfDate,
    });
    if (openingError) {
      return NextResponse.json({ error: openingError }, { status: 400 });
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
    // 🌟 [opening_fix] เทียบแบบแยก null ออกจาก 0 ให้ชัด
    // เดิมใช้ `Number(x || 0)` ซึ่งยุบ null กับ 0 เป็นค่าเดียวกัน ทำให้การเปลี่ยนจาก
    // "ไม่มียอดยกมา" เป็น "ยอดยกมา 0" (คนละความหมายกันสิ้นเชิงในสายตา engine) ไม่ถูกจับว่าเปลี่ยน
    const sameOpeningAmount =
      (opening.openingAccumDepr === null) === (before.openingAccumDepr === null) &&
      (opening.openingAccumDepr === null ||
        Number(opening.openingAccumDepr) === Number(before.openingAccumDepr));
    const sameOpeningDate =
      (opening.openingAsOfDate ? opening.openingAsOfDate.getTime() : null) ===
      (before.openingAsOfDate ? before.openingAsOfDate.getTime() : null);

    const changedCalcBasis =
      (cost !== undefined && Number(cost) !== Number(before.cost)) ||
      (depreciationRate !== undefined &&
        Number(depreciationRate) !== Number(before.depreciationRate)) ||
      (purchaseDate !== undefined &&
        new Date(purchaseDate).getTime() !== before.purchaseDate.getTime()) ||
      !sameOpeningAmount ||
      !sameOpeningDate;

    if (changedCalcBasis) {
      await prisma.assetYearlyClose.deleteMany({ where: { assetId: id } });
    }

    const updated = await prisma.asset.update({
      where: { id },
      data: {
        // assetCode ไม่อยู่ใน data โดยตั้งใจ — ล็อกไว้ไม่ให้แก้ (ดูเหตุผลด้านบน)
        companyId: companyId ? Number(companyId) : undefined,
        groupRootId: nextGroupRootId, // 🌟 [group_dup] undefined = ไม่ได้ย้ายบริษัท ปล่อยค่าเดิม
        categoryId: categoryId ? Number(categoryId) : undefined,
        description,
        location: location || null,
        cost: cost !== undefined ? Number(cost) : undefined,
        depreciationRate: depreciationRate !== undefined ? Number(depreciationRate) : undefined,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        // 🌟 [opening_fix] เขียนค่าที่ normalize แล้วเสมอ แม้การแก้ครั้งนี้จะไม่ได้แตะยอดยกมา
        // เพื่อให้แถวเก่าที่ติดบั๊ก (0 คู่กับวันที่ว่าง) ถูกซ่อมเป็น null ให้เองตอนบันทึกครั้งถัดไป
        openingAccumDepr: opening.openingAccumDepr,
        openingAsOfDate: opening.openingAsOfDate,
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
