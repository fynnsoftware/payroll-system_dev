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
import { getToken } from "next-auth/jwt";
import { calcAssetDepreciation, getFiscalPeriod, computeAccumDeprCFThroughYear, DEFAULT_CALC_RULES, CalcRule } from "@/lib/depreciation";
import { ensureAssetYearsClosed, getFrozenBFForYear } from "@/lib/assetYearClose";
import { getAssetCompanyIds, isAssetCompanyAllowed, explainAssetAccessDenied } from "@/lib/assetScope";
import { getCalcOptions } from "@/lib/assetModuleSettings";
import { bangkokYear } from "@/lib/datetime";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const includeSubCompanies = searchParams.get("includeSubCompanies") === "true";
    const yearParam = searchParams.get("year");
    // 🌟 [report_filter] กรองเพิ่มตามประเภททรัพย์สิน / ผังบัญชี (ไม่ส่งมา = ทั้งหมด)
    const categoryIdParam = searchParams.get("categoryId");
    const accountTypeIdParam = searchParams.get("accountTypeId");

    if (!companyId) {
      return NextResponse.json({ error: "กรุณาระบุบริษัท" }, { status: 400 });
    }

    // 🔒 ต้องล็อกอิน และขอรายงานได้เฉพาะบริษัทที่เป็นสมาชิก + บริษัทเปิด module Assessment ไว้
    const token = await getToken({ req: request });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const allowedCompanyIds = await getAssetCompanyIds(token);
    if (!isAssetCompanyAllowed(allowedCompanyIds, Number(companyId))) {
      const reason = await explainAssetAccessDenied(token, Number(companyId));
      return NextResponse.json({ error: reason }, { status: 403 });
    }

    const company = await prisma.company.findUnique({ where: { id: Number(companyId) } });
    if (!company) return NextResponse.json({ error: "ไม่พบบริษัทนี้" }, { status: 404 });

    const year = yearParam ? Number(yearParam) : bangkokYear(); // 🌟 [timezone] ยึดเวลาไทย
    const period = getFiscalPeriod(year);

    let companyIds = [company.id];
    if (includeSubCompanies) {
      const subs = await prisma.company.findMany({ where: { parentId: company.id }, select: { id: true } });
      companyIds = [...companyIds, ...subs.map((c) => c.id)];
    }
    // ตัดบริษัทลูกที่อยู่นอกขอบเขตออก (เช่น user อยู่บริษัทลูก ไม่ควรเห็นพี่น้องบริษัทเดียวกัน)
    if (allowedCompanyIds !== null) {
      companyIds = companyIds.filter((id) => allowedCompanyIds.includes(id));
    }

    // 🌟 [report_period] แสดงเฉพาะทรัพย์สินที่ "มีอยู่จริงแล้ว" ณ วันสิ้นงวดที่เลือก
    //
    // เดิมดึงทุกรายการของบริษัทมาโดยไม่สนวันที่ซื้อ ทำให้ดูรายงานปี 2023 แล้วเห็นทรัพย์สิน
    // ที่เพิ่งซื้อปี 2026 โผล่มาด้วย พร้อมค่าเสื่อม 0.00 และมูลค่าเท่าราคาทุนเต็มจำนวน
    // ซึ่งทำให้ยอดรวมของงวดนั้นผิดไปทั้งรายงาน
    const assets = await prisma.asset.findMany({
      where: {
        companyId: { in: companyIds },
        isActive: true,
        purchaseDate: { lte: period.end },
        // 🌟 [report_filter] กรองตามประเภททรัพย์สิน
        ...(categoryIdParam ? { categoryId: Number(categoryIdParam) } : {}),
        // 🌟 [report_filter] กรองตามผังบัญชี — กรองผ่านประเภททรัพย์สินที่ผูกบัญชีนั้นอยู่
        // (ทรัพย์สินไม่ได้ผูกบัญชีโดยตรง ความสัมพันธ์คือ Asset -> AssetCategory -> AssetAccountType)
        ...(accountTypeIdParam
          ? { category: { accountTypeId: Number(accountTypeIdParam) } }
          : {}),
      },
      include: { category: { include: { accountType: true } }, company: true },
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
    const calcOptions = await getCalcOptions(); // 🌟 [residual_option]

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
      await ensureAssetYearsClosed(prisma, a.id, assetForCalc, rules, calcOptions);

      // 🌟 [bf_consistency] ยกมาของปีนี้ = ยกไปของปีก่อนหน้าเสมอ
      // ปีที่ปิดงวดไปแล้วใช้ยอดที่บันทึกไว้ (เร็วกว่าและตรึงประวัติไม่ให้เปลี่ยน)
      // ปีที่ยังไม่ปิด เช่นดูรายงานล่วงหน้า ให้เดินคำนวณผ่าน engine ตัวเดียวกันแทน
      const frozenBF = await getFrozenBFForYear(prisma, a.id, year);
      const accumBF =
        frozenBF ?? computeAccumDeprCFThroughYear(assetForCalc, rules, year - 1, calcOptions);
      const calc = calcAssetDepreciation(assetForCalc, period, rules, accumBF, calcOptions);

      const expiredThreshold = calcOptions.enforceResidualValue ? (Number(a.cost) >= 1 ? 1 : 0) : 0;
      const isExpired = calc.nbv <= expiredThreshold;

      detail.push({
        assetCode: a.assetCode,
        category: a.category.name,
        // 🌟 [account_group] ผังบัญชีของประเภททรัพย์สินชิ้นนี้ (อาจไม่ได้ผูกไว้)
        accountCode: a.category.accountType?.code ?? null,
        accountName: a.category.accountType?.name ?? null,
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

    // ---------- Sheet 1: สรุป — 2 ชั้น: ประเภทบัญชี > ประเภททรัพย์สิน ----------
    //
    // 🌟 [account_group] ชั้นบนคือผังบัญชี เพราะเวลาปิดงบต้องกระทบยอดทีละบัญชี
    // ไม่ใช่ทีละประเภททรัพย์สิน (ประเภททรัพย์สินหลายตัวอาจลงบัญชีเดียวกัน)
    //
    // ⚠️ summary ยังเป็น array ของกลุ่มประเภทเหมือนเดิม (ไม่ทำลายของเก่า)
    // แค่เพิ่ม summaryByAccount เข้ามาสำหรับหน้าจอ/Excel ที่ต้องการชั้นบัญชี
    const totalsOf = (rows: typeof detail) => ({
      cost: round2(sum(rows, "cost")),
      accumDeprBF: round2(sum(rows, "accumDeprBF")),
      depreciationCurrentPeriod: round2(sum(rows, "depreciationCurrentPeriod")),
      accumDeprCF: round2(sum(rows, "accumDeprCF")),
      nbv: round2(sum(rows, "nbv")),
    });

    const groups = new Map<string, typeof detail>();
    for (const row of detail) {
      if (!groups.has(row.category)) groups.set(row.category, []);
      groups.get(row.category)!.push(row);
    }

    const summary = Array.from(groups.entries()).map(([categoryName, rows]) => ({
      category: categoryName,
      items: rows,
      subtotal: totalsOf(rows),
    }));

    // จัดกลุ่มตามบัญชี แล้วในแต่ละบัญชีจัดกลุ่มตามประเภททรัพย์สินอีกชั้น
    // ประเภทที่ยังไม่ได้ผูกบัญชีไว้ รวมกันไว้ท้ายสุดในกลุ่ม "ไม่ระบุบัญชี"
    // (ซ่อนทิ้งไม่ได้ ไม่งั้นยอดรวมของกลุ่มบัญชีจะไม่เท่ากับยอดรวมทั้งหมดแล้วหาสาเหตุยาก)
    const accountMap = new Map<string, typeof detail>();
    for (const row of detail) {
      const key = row.accountCode ? `${row.accountCode}|${row.accountName}` : "|";
      if (!accountMap.has(key)) accountMap.set(key, []);
      accountMap.get(key)!.push(row);
    }

    const summaryByAccount = Array.from(accountMap.entries())
      .sort(([a], [b]) => {
        // เรียงตามรหัสบัญชี ส่วน "ไม่ระบุบัญชี" ไปท้ายสุดเสมอ
        const ca = a.split("|")[0], cb = b.split("|")[0];
        if (!ca) return 1;
        if (!cb) return -1;
        return ca.localeCompare(cb);
      })
      .map(([key, accountRows]) => {
        const [code, name] = key.split("|");
        const catMap = new Map<string, typeof detail>();
        for (const row of accountRows) {
          if (!catMap.has(row.category)) catMap.set(row.category, []);
          catMap.get(row.category)!.push(row);
        }
        return {
          accountCode: code || null,
          accountName: name || null,
          categories: Array.from(catMap.entries()).map(([categoryName, rows]) => ({
            category: categoryName,
            items: rows,
            subtotal: totalsOf(rows),
          })),
          accountTotal: totalsOf(accountRows),
        };
      });

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
        summaryByAccount,
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
