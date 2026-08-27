// src/lib/depreciation.ts
// 🌟 [Phase 2 - Asset] Engine คำนวณค่าเสื่อมราคา — rule-based (condition + formula) แทนที่ if/else ตายตัวเดิม
//
// สถาปัตยกรรม: DepreciationCalcType (master data ใน DB) แต่ละแถวคือ 1 "rule" ประกอบด้วย
//   - conditionType: ตัวจับคู่เงื่อนไข (เลือกจาก CONDITION_TYPES ด้านล่าง — vocab คงที่)
//   - formulaType:   สูตรที่ใช้คำนวณเมื่อ match เงื่อนไขนั้น (เลือกจาก FORMULA_TYPES ด้านล่าง — vocab คงที่)
//   - label, conditionDescription: ข้อความที่แก้ไขได้ผ่านหน้า Settings แสดงในรายงาน
// engine จะไล่ตรวจ rule ตาม sortOrder (rule ที่ isDefault=true จะถูกตรวจเป็นตัวสุดท้ายเสมอ ใช้เป็น fallback)
//
// ⚠️ ทำไมไม่ให้ admin พิมพ์สูตรเองอิสระ (เช่น eval expression): เพราะเป็นตัวเลขทางบัญชีที่ต้อง
// ถูกต้อง 100% สูตรผิดจะทำให้รายงานผิดเงียบๆ ทุกจุดที่เรียกใช้ จึงจำกัดให้เลือกจาก "สูตรที่ทดสอบแล้ว"
// เท่านั้น (FORMULA_TYPES) ส่วน "เงื่อนไขไหนใช้สูตรไหน" ปรับเปลี่ยน/สลับกันได้อิสระผ่าน Settings
//
// 🌟 ธรรมเนียมบัญชีไทยที่พบจากไฟล์ Excel ต้นฉบับ: เก็บมูลค่าคงเหลือ 1 บาทเสมอเมื่อเสื่อมราคาเต็ม
// (ไม่ปัดเป็น 0) เช่น cost=2000 -> accumCF สูงสุด 1999, NBV=1

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY);
}

export interface AssetForCalc {
  cost: number;
  depreciationRate: number; // เช่น 0.2 = 20%/ปี
  purchaseDate: Date;
  // 🌟 [phase2asset_#15] ยอดยกมา manual สำหรับทรัพย์สินเก่า — ถ้าตั้งไว้ engine ใช้เป็นฐานแทน purchaseDate ตรงๆ
  openingAccumDepr?: number | null;
  openingAsOfDate?: Date | null;
}

export interface FiscalPeriod {
  start: Date;
  end: Date;
}

// 🌟 [phase2asset_#15] งวดบัญชีสำหรับคำนวณค่าเสื่อมราคายึดปีปฏิทิน (1 ม.ค. - 31 ธ.ค.) เสมอทุกบริษัท
// ตัด parameter companyPeriodEndDate ออกแล้วตามที่ confirm — field นั้นถูกลบออกจาก Company แล้ว
export function getFiscalPeriod(year: number): FiscalPeriod {
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31)) };
}

// 🌟 [residual_option] ตัวเลือกวิธีปิดยอดค่าเสื่อมสะสม
export interface CalcOptions {
  /**
   * true (ค่าเริ่มต้น) = คงมูลค่า 1 บาท — ค่าเสื่อมสะสมไม่เกิน (ราคาทุน - 1) และ NBV ไม่ต่ำกว่า 1
   * false = คิดตามสูตรตรงๆ ไม่มีเพดาน NBV ติดลบได้ (ให้ผลตรงกับ Excel ต้นฉบับ)
   */
  enforceResidualValue?: boolean;
}

// ---------- ตัวช่วยคำนวณค่าเสื่อมสะสม ณ วันใดวันหนึ่ง (ใช้ร่วมกันทุกสูตร) ----------
function buildAccumulator(asset: AssetForCalc, enforceResidual: boolean) {
  const cost = Number(asset.cost);
  const rate = Number(asset.depreciationRate);
  const totalUsefulLifeDays = rate > 0 ? Math.round(365 / rate) : 0;
  const endOfLifeDate = new Date(asset.purchaseDate.getTime() + totalUsefulLifeDays * MS_PER_DAY);
  const dailyDepreciation = totalUsefulLifeDays > 0 ? cost / totalUsefulLifeDays : 0;
  // ปิดโหมดคงมูลค่า -> ไม่กันเงินเหลือ เสื่อมได้เต็มราคาทุน
  const residual = enforceResidual ? (cost >= 1 ? 1 : 0) : 0;
  const depreciableBase = Math.max(0, cost - residual);

  const hasOpeningOverride = asset.openingAccumDepr != null && asset.openingAsOfDate != null;

  const accumulatedAt = (date: Date): number => {
    if (hasOpeningOverride) {
      const baseDate = asset.openingAsOfDate as Date;
      if (date < baseDate) return 0; // ก่อนวันที่ของยอดยกมา manual ไม่มีความหมาย ถือเป็น 0
      const days = diffDays(date, baseDate);
      return Math.min(depreciableBase, Math.max(0, Number(asset.openingAccumDepr) + dailyDepreciation * days));
    }
    if (date < asset.purchaseDate) return 0;
    const days = diffDays(date, asset.purchaseDate) + 1;
    return Math.min(depreciableBase, Math.max(0, dailyDepreciation * days));
  };

  return { cost, rate, totalUsefulLifeDays, endOfLifeDate, dailyDepreciation, residual, depreciableBase, enforceResidual, accumulatedAt };
}

// ==========================================
// CONDITION_TYPES — vocab คงที่ของ "ตัวจับคู่เงื่อนไข" ที่ engine รองรับ
// ==========================================
export type ConditionTypeKey =
  | "PURCHASED_DURING_PERIOD"
  | "FULLY_DEPRECIATED_BEFORE_PERIOD"
  | "FULLY_DEPRECIATED_DURING_PERIOD"
  | "ALWAYS"; // ใช้กับแถว isDefault เท่านั้น — match เสมอ

export const CONDITION_TYPE_OPTIONS: { key: ConditionTypeKey; hint: string }[] = [
  { key: "PURCHASED_DURING_PERIOD", hint: "วันที่ซื้อทรัพย์สินอยู่ภายในงวดบัญชีนี้" },
  { key: "FULLY_DEPRECIATED_BEFORE_PERIOD", hint: "เสื่อมราคาครบ (ถึงมูลค่าคงเหลือ) ก่อนงวดนี้เริ่มแล้ว" },
  { key: "FULLY_DEPRECIATED_DURING_PERIOD", hint: "จะเสื่อมราคาครบพอดีระหว่างงวดนี้" },
  { key: "ALWAYS", hint: "เงื่อนไข fallback ใช้เมื่อไม่ match เงื่อนไขอื่นเลย (สำหรับแถว default เท่านั้น)" },
];

function evaluateCondition(
  key: string,
  ctx: { asset: AssetForCalc; period: FiscalPeriod; acc: ReturnType<typeof buildAccumulator> },
): boolean {
  const { asset, period, acc } = ctx;
  const dayBeforeStart = new Date(period.start.getTime() - MS_PER_DAY);
  const accumBF = acc.accumulatedAt(dayBeforeStart);
  const accumAtEnd = acc.accumulatedAt(period.end);

  switch (key as ConditionTypeKey) {
    case "PURCHASED_DURING_PERIOD":
      return asset.purchaseDate >= period.start && asset.purchaseDate <= period.end;
    case "FULLY_DEPRECIATED_BEFORE_PERIOD":
      return accumBF >= acc.depreciableBase;
    case "FULLY_DEPRECIATED_DURING_PERIOD":
      return accumBF < acc.depreciableBase && accumAtEnd >= acc.depreciableBase;
    case "ALWAYS":
      return true;
    default:
      return false;
  }
}

// ==========================================
// FORMULA_TYPES — vocab คงที่ของ "สูตรคำนวณ" ที่ engine รองรับ (ทดสอบแล้วว่าถูกต้อง)
// ==========================================
export type FormulaTypeKey =
  | "STRAIGHT_LINE_PRORATE"
  | "PRORATE_FROM_PURCHASE"
  | "FULL_ANNUAL_FIXED"
  | "ZERO";

export const FORMULA_TYPE_OPTIONS: { key: FormulaTypeKey; hint: string }[] = [
  { key: "STRAIGHT_LINE_PRORATE", hint: "คิดตามสัดส่วนวันจริง ต่อยอดจากยอดยกมา (ถ้ามี) — สูตรมาตรฐานของระบบ" },
  { key: "PRORATE_FROM_PURCHASE", hint: "ราคาทุน x วันที่ผ่านมา / อายุทั้งหมด นับจากวันซื้อเสมอ ไม่สนใจยอดยกมา (สูตรเดียวกับ Excel ต้นฉบับ)" },
  { key: "FULL_ANNUAL_FIXED", hint: "คิดเต็มจำนวนคงที่ต่อปี = ราคาทุน x อัตรา (ไม่ prorate)" },
  { key: "ZERO", hint: "ไม่มีค่าเสื่อมเพิ่มในงวดนี้ (ยกมา = ยกไป)" },
];

function applyFormula(
  key: string,
  ctx: {
    asset: AssetForCalc;
    period: FiscalPeriod;
    acc: ReturnType<typeof buildAccumulator>;
    accumDeprBF: number;
  },
): number {
  const { asset, period, acc, accumDeprBF } = ctx;
  switch (key as FormulaTypeKey) {
    case "STRAIGHT_LINE_PRORATE": {
      const accumAtEnd = acc.accumulatedAt(period.end);
      return Math.max(0, accumAtEnd - accumDeprBF);
    }

    // 🌟 สูตรเดียวกับไฟล์ Excel ต้นฉบับ: ราคาทุน x อายุที่ผ่านมา / อายุทั้งหมด
    // นับจาก "วันที่ซื้อ" เสมอ ไม่สนใจยอดยกมา
    //
    // ⚠️ ต่างจาก STRAIGHT_LINE_PRORATE ตรงที่ค่าที่ได้เป็นยอดสะสมนับจากวันซื้อ ไม่ใช่ส่วนเพิ่มของงวด
    // จึงเหมาะกับกรณีที่ยังไม่เคยเสื่อมราคามาก่อน (ยอดยกมา = 0) ซึ่งตรงกับเงื่อนไข "ซื้อระหว่างปี" พอดี
    // ถ้าเอาไปใช้กับทรัพย์สินที่มียอดยกมา จะกลายเป็นนับซ้ำ — Excel ต้นฉบับมีปัญหานี้จนได้มูลค่าคงเหลือติดลบ
    // ที่นี่จึงใส่เพดานไม่ให้เกินมูลค่าที่เหลือจะเสื่อมได้ กันไม่ให้ตัวเลขติดลบ
    case "PRORATE_FROM_PURCHASE": {
      if (acc.totalUsefulLifeDays <= 0) return 0;
      const daysUsed = Math.max(
        0,
        Math.min(acc.totalUsefulLifeDays, diffDays(period.end, asset.purchaseDate) + 1),
      );
      const raw = (acc.cost * daysUsed) / acc.totalUsefulLifeDays;
      // โหมดคงมูลค่า 1 บาท -> ใส่เพดานไม่ให้เกินมูลค่าที่เหลือจะเสื่อมได้
      // โหมดสูตรตรง -> ปล่อยตามสูตร ทำให้ยอดยกไปเกินราคาทุนและ NBV ติดลบได้เหมือน Excel
      return acc.enforceResidual
        ? Math.max(0, Math.min(raw, acc.depreciableBase - accumDeprBF))
        : Math.max(0, raw);
    }

    case "FULL_ANNUAL_FIXED": {
      const full = acc.cost * acc.rate;
      return acc.enforceResidual
        ? Math.max(0, Math.min(acc.depreciableBase - accumDeprBF, full))
        : Math.max(0, full);
    }
    case "ZERO":
      return 0;
    default:
      return 0;
  }
}

// ==========================================
// Rule ที่โหลดมาจาก DB (DepreciationCalcType) ส่งเข้า engine
// ==========================================
export interface CalcRule {
  code: string;
  label: string;
  conditionDescription: string;
  conditionType: string;
  formulaType: string;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
}

// seed เริ่มต้น — ตรงกับ template Excel ต้นฉบับ 4 แบบ
export const DEFAULT_CALC_RULES: Omit<CalcRule, "isActive">[] = [
  {
    code: "PURCHASED_DURING_PERIOD",
    label: "ซื้อระหว่างปี",
    conditionDescription: "วันที่ซื้อทรัพย์สินอยู่ภายในงวดบัญชีนี้ ยังไม่เคยเสื่อมราคามาก่อน",
    conditionType: "PURCHASED_DURING_PERIOD",
    formulaType: "STRAIGHT_LINE_PRORATE",
    sortOrder: 1,
    isDefault: false,
  },
  {
    code: "FULLY_DEPRECIATED_BEFORE",
    label: "คิดค่าเสื่อมราคาหมดแล้วตั้งแต่ต้นปี",
    conditionDescription: "เสื่อมราคาครบ (เหลือมูลค่าคงเหลือ 1 บาท) ก่อนงวดนี้เริ่มแล้ว",
    conditionType: "FULLY_DEPRECIATED_BEFORE_PERIOD",
    formulaType: "ZERO",
    sortOrder: 2,
    isDefault: false,
  },
  {
    code: "FULLY_DEPRECIATED_DURING",
    label: "ค่าเสื่อมราคาหมดในระหว่างปี",
    conditionDescription: "จะเสื่อมราคาครบพอดีระหว่างงวดนี้ คิดค่าเสื่อมถึงแค่วันสิ้นอายุ",
    conditionType: "FULLY_DEPRECIATED_DURING_PERIOD",
    formulaType: "STRAIGHT_LINE_PRORATE",
    sortOrder: 3,
    isDefault: false,
  },
  {
    code: "FULL_YEAR",
    label: "คิดค่าเสื่อมราคาเต็มปี",
    conditionDescription: "ถือทรัพย์สินเต็มงวด ยังไม่หมดอายุ (เงื่อนไข fallback)",
    conditionType: "ALWAYS",
    formulaType: "STRAIGHT_LINE_PRORATE",
    sortOrder: 99,
    isDefault: true,
  },
];

export interface DepreciationResult {
  totalUsefulLifeDays: number;
  endOfLifeDate: Date;
  daysUsedTotal: number;
  accumDeprBF: number;
  depreciationCurrentPeriod: number;
  accumDeprCF: number;
  nbv: number;
  matchedRuleCode: string;
  calcTypeLabel: string;
  conditionDescription: string;
}

export function calcAssetDepreciation(
  asset: AssetForCalc,
  period: FiscalPeriod,
  rules: CalcRule[],
  // 🌟 [phase2asset_#15] ถ้าปีก่อนหน้าถูกปิดงวดไปแล้ว (AssetYearlyClose) ส่งค่า accumDeprCF ของปีนั้นมาที่นี่
  // เพื่อใช้เป็นยอดยกมาที่ "แน่นอนตายตัว" แทนการคำนวณสดย้อนหลังจากวันที่ซื้อทุกครั้ง (กันประวัติเพี้ยนถ้า
  // มีคนแก้ rate/rule ทีหลัง) ถ้าไม่ส่งมา จะคำนวณสดตามปกติ (กรณียังไม่เคยปิดงวดปีไหนเลย)
  frozenAccumDeprBF?: number,
  options?: CalcOptions,
): DepreciationResult {
  const enforceResidual = options?.enforceResidualValue ?? true;
  const acc = buildAccumulator(asset, enforceResidual);
  const dayBeforeStart = new Date(period.start.getTime() - MS_PER_DAY);
  const accumDeprBF = frozenAccumDeprBF ?? acc.accumulatedAt(dayBeforeStart);

  const activeRules = rules.filter((r) => r.isActive);
  const nonDefaultRules = activeRules.filter((r) => !r.isDefault).sort((a, b) => a.sortOrder - b.sortOrder);
  const defaultRule = activeRules.find((r) => r.isDefault) ?? (DEFAULT_CALC_RULES.find((r) => r.isDefault) as CalcRule);

  let matched: CalcRule = { ...defaultRule, isActive: true } as CalcRule;
  for (const rule of nonDefaultRules) {
    if (evaluateCondition(rule.conditionType, { asset, period, acc })) {
      matched = rule;
      break;
    }
  }

  const depreciationCurrentPeriod = applyFormula(matched.formulaType, { asset, period, acc, accumDeprBF });

  // 🌟 [residual_option] สองโหมดของการปิดยอด
  //   เปิดคงมูลค่า : ค่าเสื่อมสะสมยกไปไม่เกิน (ราคาทุน - 1) และ NBV ไม่ต่ำกว่า 1
  //   ปิดคงมูลค่า : ยกไป = ยกมา + ค่าเสื่อมงวดนี้ / NBV = ราคาทุน - ยกไป (ติดลบได้)
  const rawAccumCF = accumDeprBF + depreciationCurrentPeriod;
  const accumDeprCF = enforceResidual ? Math.min(acc.depreciableBase, rawAccumCF) : rawAccumCF;
  const rawNbv = acc.cost - accumDeprCF;
  const nbv = enforceResidual ? Math.max(acc.residual, rawNbv) : rawNbv;
  const daysUsedTotal = Math.max(0, Math.min(acc.totalUsefulLifeDays, diffDays(period.end, asset.purchaseDate) + 1));

  return {
    totalUsefulLifeDays: acc.totalUsefulLifeDays,
    endOfLifeDate: acc.endOfLifeDate,
    daysUsedTotal,
    accumDeprBF: round2(accumDeprBF),
    depreciationCurrentPeriod: round2(depreciationCurrentPeriod),
    accumDeprCF: round2(accumDeprCF),
    nbv: round2(nbv),
    matchedRuleCode: matched.code,
    calcTypeLabel: matched.label,
    conditionDescription: matched.conditionDescription,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 🌟 แสดงอัตราค่าเสื่อมในรูปแบบ "อายุการใช้งาน (เปอร์เซ็นต์)" เช่น "5 ปี (20.00%)"
 *
 * อ่านง่ายกว่าการโชว์เปอร์เซ็นต์เปล่าๆ เพราะคนทำงานคิดเป็น "ของชิ้นนี้ใช้กี่ปี" มากกว่า
 * ใช้ totalUsefulLifeDays ที่ engine คำนวณไว้แล้วเป็นฐาน ตัวเลขจะได้ตรงกับคอลัมน์อายุการใช้งาน
 */
export function formatRateWithYears(rate: number, totalUsefulLifeDays?: number): string {
  const percentText = `${(rate * 100).toFixed(2)}%`;

  const days =
    totalUsefulLifeDays && totalUsefulLifeDays > 0
      ? totalUsefulLifeDays
      : rate > 0
        ? Math.round(365 / rate)
        : 0;

  if (!days) return percentText;

  const years = days / 365;
  // 5 -> "5" | 6.666... -> "6.67" (ตัดศูนย์ท้ายทิ้งไม่ให้รก)
  const yearsText = Number.isInteger(years)
    ? String(years)
    : years.toFixed(2).replace(/\.?0+$/, "");

  return `${yearsText} ปี (${percentText})`;
}

/**
 * 🌟 [bf_consistency] คำนวณ "ค่าเสื่อมสะสมยกไป" สะสมถึงสิ้นปี throughYear
 * โดยเดินคำนวณทีละปีผ่าน engine ตัวเดียวกับที่ใช้ออกรายงาน
 *
 * ⚠️ ทำไมต้องมี: เดิม "ยกมา" ของงวดหนึ่งใช้วิธีคิดค่าเสื่อมสะสมดิบ ณ วันก่อนงวดเริ่ม
 * ซึ่งไม่ได้ผ่าน rule engine จึงอาจไม่เท่ากับ "ยกไป" ของปีก่อนหน้าที่รายงานแสดงไว้
 * (เห็นชัดเมื่อกฎใช้สูตรอย่าง FULL_ANNUAL_FIXED หรือ PRORATE_FROM_PURCHASE
 *  ซึ่งให้ผลต่างจากการคิดตามสัดส่วนวันแบบตรงไปตรงมา)
 *
 * ฟังก์ชันนี้ทำให้ ยกมาของปี Y = ยกไปของปี Y-1 เสมอโดยโครงสร้าง ไม่ต้องหวังให้บังเอิญตรงกัน
 */
export function computeAccumDeprCFThroughYear(
  asset: AssetForCalc,
  rules: CalcRule[],
  throughYear: number,
  options?: CalcOptions,
): number {
  const purchaseYear = asset.purchaseDate.getUTCFullYear();
  const openingYear = asset.openingAsOfDate ? asset.openingAsOfDate.getUTCFullYear() : null;

  // ปีแรกที่ต้องเริ่มคิด — ถ้ามียอดยกมา manual ให้เริ่มปีถัดจากวันที่ของยอดนั้น
  const startYear = openingYear !== null ? openingYear + 1 : purchaseYear;

  // ค่าตั้งต้นก่อนปีแรก = ยอดยกมา manual (ถ้ามี) ไม่งั้นเริ่มจากศูนย์
  let cf = asset.openingAccumDepr != null ? Number(asset.openingAccumDepr) : 0;

  for (let y = startYear; y <= throughYear; y++) {
    cf = calcAssetDepreciation(asset, getFiscalPeriod(y), rules, cf, options).accumDeprCF;
  }

  return cf;
}
