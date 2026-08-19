// src/app/api/assets/report/route.ts
// 🌟 [Phase 2 - Asset task #21, #22] Report 2 sheet: สรุป (group by category) + รายละเอียด
// Query params: companyId (required), includeSubCompanies=true/false, year (fiscal year, default = ปีปัจจุบัน)
//
// ⚠️ ตอนนี้รองรับดูทีละปีงบ (1 fiscal period ต่อ 1 ครั้ง) ยังไม่ทำ multi-year range ในชั้น backend
// (ฝั่ง UI ถ้าต้องการดูหลายปีสามารถเรียก endpoint นี้วนหลายครั้งได้)
//
// 🌟 [phase2asset_#15] ทุกครั้งที่เรียก endpoint นี้ จะเช็คและปิดงวดปีที่ผ่านไปแล้ว (ก่อนปีปัจจุบัน)
// ให้อัตโนมัติก่อนคำนวณ (ensureAssetYearsClosed) — งวดบัญชียึด 1 ม.ค. - 31 ธ.ค. เสมอทุกบริษัท
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcAssetDepreciation, getFiscalPeriod, DEFAULT_CALC_RULES, CalcRule } from "@/lib/depreciation";
import { ensureAssetYearsClosed, getFrozenBFForYear } from "@/lib/assetYearClose";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const includeSubCompanies = searchParams.get("includeSubCompanies") === "true";
    const yearParam = searchParams.get("year");

    if (!companyId) {
      return NextResponse.json({ error: "กรุณาระบุบริษัท" }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { id: Number(companyId) } });
    if (!company) return NextResponse.json({ error: "ไม่พบบริษัทนี้" }, { status: 404 });

    const year = yearParam ? Number(yearParam) : new Date().getFullYear();
    const period = getFiscalPeriod(year);

    let companyIds = [company.id];
    if (includeSubCompanies) {
      const subs = await prisma.company.findMany({ where: { parentId: company.id }, select: { id: true } });
      companyIds = [...companyIds, ...subs.map((c) => c.id)];
    }

    const assets = await prisma.asset.findMany({
      where: { companyId: { in: companyIds }, isActive: true },
      include: { category: true, company: true },
      orderBy: { assetCode: "asc" },
    });

    // 🌟 ดึง rule ปัจจุบันของ "ประเภทการคำนวณค่าเสื่อมราคา" จาก master data (lazy-seed ถ้ายังไม่มี)
    let calcTypeRows = await prisma.depreciationCalcType.findMany();
    if (calcTypeRows.length === 0) {
      await prisma.depreciationCalcType.createMany({
        data: DEFAULT_CALC_RULES.map((r) => ({ ...r, isActive: true })),
        skipDuplicates: true,
      });
      calcTypeRows = await prisma.depreciationCalcType.findMany();
    }
    const rules: CalcRule[] = calcTypeRows;

    // ---------- Sheet 2: รายละเอียด ----------
    const detail = [];
    for (const a of assets) {
      const assetForCalc = {
        cost: Number(a.cost),
        depreciationRate: Number(a.depreciationRate),
        purchaseDate: a.purchaseDate,
        openingAccumDepr: a.openingAccumDepr != null ? Number(a.openingAccumDepr) : null,
        openingAsOfDate: a.openingAsOfDate,
      };

      // 🌟 ปิดงวดปีที่ผ่านไปแล้วให้อัตโนมัติก่อน (idempotent — ถ้าปิดไปแล้วจะข้าม)
      await ensureAssetYearsClosed(prisma, a.id, assetForCalc, rules);

      const frozenBF = await getFrozenBFForYear(prisma, a.id, year);
      const calc = calcAssetDepreciation(assetForCalc, period, rules, frozenBF);

      const residual = Number(a.cost) >= 1 ? 1 : 0;
      const isExpired = calc.nbv <= residual;

      detail.push({
        assetCode: a.assetCode,
        category: a.category.name,
        description: a.description,
        location: a.location,
        companyName: a.company.companyName,
        depreciationRate: Number(a.depreciationRate),
        purchaseDate: a.purchaseDate,
        endOfLifeDate: calc.endOfLifeDate,
        totalUsefulLifeDays: calc.totalUsefulLifeDays,
        daysUsedTotal: calc.daysUsedTotal,
        calcType: calc.calcTypeLabel,
        calcCondition: calc.conditionDescription, // 🌟 เอา condition มาแสดงในรายละเอียดตามที่ขอ
        cost: Number(a.cost),
        accumDeprBF: calc.accumDeprBF,
        depreciationCurrentPeriod: calc.depreciationCurrentPeriod,
        accumDeprCF: calc.accumDeprCF,
        nbv: calc.nbv,
        isExpired, // 🌟 [phase2asset_#16] badge "หมดอายุ" อัตโนมัติเมื่อ NBV = มูลค่าคงเหลือ (1 บาท)
      });
    }

    // ---------- Sheet 1: สรุป (group by category, subtotal + grand total) ----------
    const groups = new Map<string, typeof detail>();
    for (const row of detail) {
      if (!groups.has(row.category)) groups.set(row.category, []);
      groups.get(row.category)!.push(row);
    }

    const summary = Array.from(groups.entries()).map(([categoryName, rows]) => ({
      category: categoryName,
      items: rows,
      subtotal: {
        cost: round2(sum(rows, "cost")),
        accumDeprBF: round2(sum(rows, "accumDeprBF")),
        depreciationCurrentPeriod: round2(sum(rows, "depreciationCurrentPeriod")),
        accumDeprCF: round2(sum(rows, "accumDeprCF")),
        nbv: round2(sum(rows, "nbv")),
      },
    }));

    const grandTotal = {
      cost: round2(sum(detail, "cost")),
      accumDeprBF: round2(sum(detail, "accumDeprBF")),
      depreciationCurrentPeriod: round2(sum(detail, "depreciationCurrentPeriod")),
      accumDeprCF: round2(sum(detail, "accumDeprCF")),
      nbv: round2(sum(detail, "nbv")),
    };

    return NextResponse.json(
      {
        companyName: company.companyName,
        periodEndDate: period.end,
        periodStartDate: period.start,
        summary,
        detail,
        grandTotal,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET Asset Report Error:", error);
    return NextResponse.json({ error: "สร้างรายงานไม่สำเร็จ" }, { status: 500 });
  }
}

function sum(rows: any[], key: string): number {
  return rows.reduce((total, r) => total + (r[key] || 0), 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
