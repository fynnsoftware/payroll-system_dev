// src/app/api/assets/route.ts
// 🌟 [Phase 2 - Asset task #19] หน้าจอทะเบียนทรัพย์สิน — CRUD หลัก
// ⚠️ ตามที่ user สั่งไว้ "อย่าเพิ่งกังวลเรื่อง login" — endpoint นี้ยังไม่ทำ auth check
// (auth เต็มรูปแบบอยู่ใน task #10 แยกต่างหาก ห้ามลืมกลับมาใส่ก่อน deploy จริง)
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcAssetDepreciation, getFiscalPeriod, DEFAULT_CALC_RULES, CalcRule } from "@/lib/depreciation";
import { ensureAssetYearsClosed, getFrozenBFForYear } from "@/lib/assetYearClose";

// ==========================================
// 🟢 GET: ดึงรายการทรัพย์สิน (รองรับ filter บริษัท + group company)
// ==========================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const includeSubCompanies = searchParams.get("includeSubCompanies") === "true";
    const categoryId = searchParams.get("categoryId");
    const search = searchParams.get("search");
    const statusFilter = searchParams.get("status"); // ACTIVE | TERMINATED | ALL

    const where: any = {};

    if (companyId) {
      let companyIds = [Number(companyId)];
      if (includeSubCompanies) {
        const subs = await prisma.company.findMany({
          where: { parentId: Number(companyId) },
          select: { id: true },
        });
        companyIds = [...companyIds, ...subs.map((c) => c.id)];
      }
      where.companyId = { in: companyIds };
    }

    if (categoryId) where.categoryId = Number(categoryId);

    if (statusFilter === "ACTIVE") where.isActive = true;
    else if (statusFilter === "TERMINATED") where.isActive = false;
    // ไม่ระบุ / ALL -> แสดงทั้งหมด

    if (search) {
      where.OR = [
        { assetCode: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const assets = await prisma.asset.findMany({
      where,
      include: { company: true, category: true },
      orderBy: { assetCode: "asc" },
    });

    // 🌟 [phase2asset_#15/#16] ทุกครั้งที่เปิดหน้า Asset Register ให้ปิดงวดปีที่ผ่านไปแล้วอัตโนมัติ
    // และคำนวณ isExpired (badge "หมดอายุ") ของแต่ละตัว ณ วันนี้
    // ⚠️ note ด้าน perf: วนคำนวณทีละตัว ถ้ามีทรัพย์สินเยอะมากอาจช้า พอใช้ได้สำหรับสเกลปัจจุบัน
    let calcTypeRows = await prisma.depreciationCalcType.findMany();
    if (calcTypeRows.length === 0) {
      await prisma.depreciationCalcType.createMany({
        data: DEFAULT_CALC_RULES.map((r) => ({ ...r, isActive: true })),
        skipDuplicates: true,
      });
      calcTypeRows = await prisma.depreciationCalcType.findMany();
    }
    const rules: CalcRule[] = calcTypeRows;
    const currentYear = new Date().getUTCFullYear();
    const currentPeriod = getFiscalPeriod(currentYear);

    const assetsWithStatus = [];
    for (const a of assets) {
      const assetForCalc = {
        cost: Number(a.cost),
        depreciationRate: Number(a.depreciationRate),
        purchaseDate: a.purchaseDate,
        openingAccumDepr: a.openingAccumDepr != null ? Number(a.openingAccumDepr) : null,
        openingAsOfDate: a.openingAsOfDate,
      };
      await ensureAssetYearsClosed(prisma, a.id, assetForCalc, rules);
      const frozenBF = await getFrozenBFForYear(prisma, a.id, currentYear);
      const calc = calcAssetDepreciation(assetForCalc, currentPeriod, rules, frozenBF);
      const residual = Number(a.cost) >= 1 ? 1 : 0;
      assetsWithStatus.push({ ...a, isExpired: calc.nbv <= residual, currentNbv: calc.nbv });
    }

    return NextResponse.json(assetsWithStatus, { status: 200 });
  } catch (error) {
    console.error("GET Assets Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลทรัพย์สินไม่สำเร็จ" }, { status: 500 });
  }
}

// ==========================================
// 🔵 POST: สร้างทรัพย์สินใหม่
// ==========================================
export async function POST(request: NextRequest) {
  try {
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
      openingAccumDepr, // 🌟 [phase2asset_#15] ยอดยกมา manual สำหรับทรัพย์สินเก่า (optional)
      openingAsOfDate,
    } = body;

    if (!assetCode || !companyId || !categoryId || !description || cost === undefined || !depreciationRate || !purchaseDate) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" }, { status: 400 });
    }

    if ((openingAccumDepr && !openingAsOfDate) || (!openingAccumDepr && openingAsOfDate)) {
      return NextResponse.json({ error: "ถ้ากรอกยอดยกมา ต้องระบุวันที่ของยอดยกมาด้วย (และในทางกลับกัน)" }, { status: 400 });
    }

    const asset = await prisma.asset.create({
      data: {
        assetCode: String(assetCode).trim(),
        companyId: Number(companyId),
        categoryId: Number(categoryId),
        description,
        location: location || null,
        cost: Number(cost),
        depreciationRate: Number(depreciationRate),
        purchaseDate: new Date(purchaseDate),
        openingAccumDepr: openingAccumDepr !== undefined && openingAccumDepr !== "" ? Number(openingAccumDepr) : null,
        openingAsOfDate: openingAsOfDate ? new Date(openingAsOfDate) : null,
      },
    });

    return NextResponse.json({ message: "บันทึกทรัพย์สินสำเร็จ", data: asset }, { status: 201 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "รหัสทรัพย์สินนี้มีอยู่ในระบบแล้ว" }, { status: 400 });
    }
    console.error("POST Asset Error:", error);
    return NextResponse.json({ error: "บันทึกทรัพย์สินไม่สำเร็จ" }, { status: 500 });
  }
}
