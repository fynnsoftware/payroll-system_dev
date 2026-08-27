// src/app/api/assets/route.ts
// 🌟 [Phase 2 - Asset task #19] หน้าจอทะเบียนทรัพย์สิน — CRUD หลัก
// 🔒 [asset_redesign] ขอบเขตยึดตาม membership + module ของบริษัท ไม่ใช่เครือบริษัทแล้ว
// (ดูกฎกลางที่ src/lib/assetScope.ts) ADMIN เห็นและแก้ไขได้ทุกบริษัทเสมอ
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { calcAssetDepreciation, getFiscalPeriod, computeAccumDeprCFThroughYear, DEFAULT_CALC_RULES, CalcRule } from "@/lib/depreciation";
import { ensureAssetYearsClosed, getFrozenBFForYear } from "@/lib/assetYearClose";
import { getAssetCompanyIds, isAssetCompanyAllowed, explainAssetAccessDenied } from "@/lib/assetScope";
import { parseAssetCode, generateAssetCodes } from "@/lib/assetCode";
import { validateOpeningBalance } from "@/lib/assetValidation";
import { getCalcOptions } from "@/lib/assetModuleSettings";

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

    // 🔒 ต้องล็อกอินก่อน และเห็นได้เฉพาะบริษัทที่เป็นสมาชิก + บริษัทเปิด module Assessment ไว้
    const token = await getToken({ req: request });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const allowedCompanyIds = await getAssetCompanyIds(token);

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
      // ตัดบริษัทที่อยู่นอกขอบเขตออก กันกรณียิง companyId ของบริษัทอื่นเข้ามาตรงๆ
      if (allowedCompanyIds !== null) {
        companyIds = companyIds.filter((id) => allowedCompanyIds.includes(id));
      }
      where.companyId = { in: companyIds.length > 0 ? companyIds : [-1] };
    } else if (allowedCompanyIds !== null) {
      // ไม่ได้ระบุบริษัทมา -> จำกัดให้เห็นเฉพาะในเครือของตัวเอง (ADMIN จะข้ามเงื่อนไขนี้)
      where.companyId = { in: allowedCompanyIds.length > 0 ? allowedCompanyIds : [-1] };
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
    const calcOptions = await getCalcOptions(); // 🌟 [residual_option]
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
      await ensureAssetYearsClosed(prisma, a.id, assetForCalc, rules, calcOptions);
      // 🌟 [bf_consistency] ใช้กฎเดียวกับหน้ารายงาน ตัวเลขสองหน้าจะได้ตรงกัน
      const frozenBF = await getFrozenBFForYear(prisma, a.id, currentYear);
      const accumBF =
        frozenBF ?? computeAccumDeprCFThroughYear(assetForCalc, rules, currentYear - 1, calcOptions);
      const calc = calcAssetDepreciation(assetForCalc, currentPeriod, rules, accumBF, calcOptions);
      // ถือว่าหมดอายุเมื่อเสื่อมราคาครบแล้ว — โหมดคงมูลค่าดูที่ 1 บาท, โหมดสูตรตรงดูที่ 0 หรือติดลบ
      const expiredThreshold = calcOptions.enforceResidualValue ? (Number(a.cost) >= 1 ? 1 : 0) : 0;
      assetsWithStatus.push({ ...a, isExpired: calc.nbv <= expiredThreshold, currentNbv: calc.nbv });
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
    // 🔒 [security_asset] สร้างทรัพย์สินได้เฉพาะให้บริษัทที่อยู่ในขอบเขตของตัวเอง
    const token = await getToken({ req: request });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      quantity, // 🌟 [asset_duplicate] จำนวนรายการที่ต้องการสร้าง (ไม่ส่งมา = 1)
    } = body;

    if (!assetCode || !companyId || !categoryId || !description || cost === undefined || !depreciationRate || !purchaseDate) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" }, { status: 400 });
    }

    // จำกัดไว้ที่ 50 รายการต่อครั้ง กัน request ใหญ่เกินจน timeout บน serverless
    const qty = Math.max(1, Math.min(50, Number(quantity) || 1));

    const allowedCompanyIds = await getAssetCompanyIds(token);
    if (!isAssetCompanyAllowed(allowedCompanyIds, Number(companyId))) {
      // บอกสาเหตุให้ตรงจุด (ไม่ได้เป็นสมาชิก vs บริษัทปิดบริการ) จะได้ไม่งงว่าทำไมทำไม่ได้
      const reason = await explainAssetAccessDenied(token, Number(companyId));
      return NextResponse.json({ error: reason }, { status: 403 });
    }

    // 🔒 [validation] กันยอดยกมาที่ขัดกับวันที่ซื้อ ไม่ให้หลุดเข้าระบบ
    const openingError = validateOpeningBalance({
      cost: Number(cost),
      purchaseDate: new Date(purchaseDate),
      openingAccumDepr:
        openingAccumDepr !== undefined && openingAccumDepr !== "" && openingAccumDepr !== null
          ? Number(openingAccumDepr)
          : null,
      openingAsOfDate: openingAsOfDate ? new Date(openingAsOfDate) : null,
    });
    if (openingError) {
      return NextResponse.json({ error: openingError }, { status: 400 });
    }

    // 🌟 [asset_duplicate] สร้างรหัสรันต่อเนื่อง โดยข้ามรหัสที่ถูกใช้ไปแล้ว
    // ดึงรหัสเดิมที่ขึ้นต้นด้วย prefix เดียวกันมาก่อน (query แคบ ไม่ใช่ทั้งตาราง)
    const parsed = parseAssetCode(String(assetCode));
    const existing = await prisma.asset.findMany({
      where: { assetCode: { startsWith: parsed.prefix } },
      select: { assetCode: true },
    });
    const takenCodes = new Set(existing.map((a) => a.assetCode));

    const codes = generateAssetCodes(String(assetCode), qty, takenCodes);
    if (codes.length < qty) {
      return NextResponse.json(
        { error: "ไม่สามารถสร้างรหัสทรัพย์สินได้ครบตามจำนวน กรุณาเปลี่ยนรหัสตั้งต้น" },
        { status: 400 },
      );
    }

    const sharedData = {
      companyId: Number(companyId),
      categoryId: Number(categoryId),
      description,
      location: location || null,
      cost: Number(cost),
      depreciationRate: Number(depreciationRate),
      purchaseDate: new Date(purchaseDate),
      openingAccumDepr:
        openingAccumDepr !== undefined && openingAccumDepr !== "" ? Number(openingAccumDepr) : null,
      openingAsOfDate: openingAsOfDate ? new Date(openingAsOfDate) : null,
    };

    // สร้างทั้งชุดใน transaction เดียว — ถ้าชิ้นไหนชน unique จะ rollback ทั้งหมด
    // ไม่ปล่อยให้สร้างได้ครึ่งๆ กลางๆ แล้วผู้ใช้ต้องมานั่งไล่ลบเอง
    await prisma.$transaction(
      codes.map((code) => prisma.asset.create({ data: { ...sharedData, assetCode: code } })),
    );

    return NextResponse.json(
      {
        message:
          qty === 1
            ? "บันทึกทรัพย์สินสำเร็จ"
            : `สร้างทรัพย์สิน ${qty} รายการสำเร็จ (${codes[0]} - ${codes[codes.length - 1]})`,
        codes,
        count: codes.length,
      },
      { status: 201 },
    );
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "รหัสทรัพย์สินนี้มีอยู่ในระบบแล้ว" }, { status: 400 });
    }
    console.error("POST Asset Error:", error);
    return NextResponse.json({ error: "บันทึกทรัพย์สินไม่สำเร็จ" }, { status: 500 });
  }
}
