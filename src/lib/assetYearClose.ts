// src/lib/assetYearClose.ts
// 🌟 [phase2asset_#15] กลไกปิดงวดค่าเสื่อมราคารายปีแบบอัตโนมัติ — ไม่มีปุ่ม manual close ตามที่ user confirm
// เรียกจาก API route (Asset Register / Asset Report) ทุกครั้งที่เปิดหน้า — เช็คว่ามีปีที่ผ่านไปแล้ว
// (ก่อนปีปัจจุบัน) แต่ยังไม่เคยปิดหรือไม่ ถ้ามีให้คำนวณและบันทึกเป็นประวัติถาวรทันที (closedBy = "SYSTEM (Auto)")
import { PrismaClient } from "@prisma/client";
import { calcAssetDepreciation, getFiscalPeriod, AssetForCalc, CalcRule } from "./depreciation";

export async function ensureAssetYearsClosed(
  prisma: PrismaClient,
  assetId: string,
  asset: AssetForCalc,
  rules: CalcRule[],
): Promise<void> {
  const currentYear = new Date().getUTCFullYear();
  const uptoYear = currentYear - 1; // ปิดได้แค่ปีที่ "ผ่านไปแล้วเต็มปี" เท่านั้น ปีปัจจุบันยังเปิดอยู่เสมอ

  const purchaseYear = asset.purchaseDate.getUTCFullYear();
  const openingYear = asset.openingAsOfDate ? asset.openingAsOfDate.getUTCFullYear() : null;
  const startYear = openingYear ? openingYear + 1 : purchaseYear;

  if (uptoYear < startYear) return; // ยังไม่มีปีไหนต้องปิดเลย (ทรัพย์สินใหม่/ซื้อปีนี้)

  const existingCloses = await prisma.assetYearlyClose.findMany({
    where: { assetId, year: { gte: startYear, lte: uptoYear } },
  });
  const closedYearsSet = new Set(existingCloses.map((c) => c.year));
  if (closedYearsSet.size === uptoYear - startYear + 1) return; // ปิดครบทุกปีแล้ว ไม่ต้องทำอะไร

  // หา accumDeprCF ของปีก่อน startYear (ถ้าเคยปิดค้างไว้จากรอบก่อน) มาใช้เป็นจุดเริ่มต่อ
  let lastClosedCF: number | undefined;
  const priorClose = await prisma.assetYearlyClose.findFirst({
    where: { assetId, year: { lt: startYear } },
    orderBy: { year: "desc" },
  });
  if (priorClose) lastClosedCF = Number(priorClose.accumDeprCF);

  for (let year = startYear; year <= uptoYear; year++) {
    if (closedYearsSet.has(year)) {
      // ปีนี้เคยปิดแล้ว แต่ยังต้องอัปเดต lastClosedCF ให้ปีถัดไปต่อได้ถูกต้อง
      const row = existingCloses.find((c) => c.year === year)!;
      lastClosedCF = Number(row.accumDeprCF);
      continue;
    }

    const period = getFiscalPeriod(year);
    const result = calcAssetDepreciation(asset, period, rules, lastClosedCF);

    await prisma.assetYearlyClose.create({
      data: {
        assetId,
        year,
        accumDeprBF: result.accumDeprBF,
        depreciationForYear: result.depreciationCurrentPeriod,
        accumDeprCF: result.accumDeprCF,
        nbv: result.nbv,
        calcTypeLabel: result.calcTypeLabel,
        closedBy: "SYSTEM (Auto)",
      },
    });

    lastClosedCF = result.accumDeprCF;
  }
}

// 🌟 ดึงยอดยกมาที่ "ปิดงวดแล้ว" ของปีก่อนหน้า targetYear (ถ้ามี) ไว้ใช้เป็น frozenAccumDeprBF
export async function getFrozenBFForYear(
  prisma: PrismaClient,
  assetId: string,
  targetYear: number,
): Promise<number | undefined> {
  const closed = await prisma.assetYearlyClose.findUnique({
    where: { assetId_year: { assetId, year: targetYear - 1 } },
  });
  return closed ? Number(closed.accumDeprCF) : undefined;
}
