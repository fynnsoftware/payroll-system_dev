// src/lib/assetValidation.ts
// 🌟 [validation] ตรวจความสมเหตุสมผลของ "ยอดยกมา" ก่อนบันทึกทรัพย์สิน
//
// ⚠️ ทำไมต้องบล็อกที่ API ไม่ใช่แค่เตือนใน UI:
// ยอดยกมาที่ขัดกับวันที่ซื้อทำให้ engine คำนวณจากฐานที่ผิด แล้วได้ผลลัพธ์ที่ "ดูปกติ" แต่ผิด
// เช่น ซื้อ 05/05/2026 แต่กรอกยอดยกมา 1,999 (จากราคาทุน 2,000) ณ 31/12/2025
// -> ระบบจะแสดงมูลค่าคงเหลือ 1 บาท และขึ้นสถานะ "หมดอายุ" ทั้งที่เพิ่งซื้อได้ 8 เดือน
// ไม่มีอะไรฟ้องว่าผิด ผู้ใช้จึงไม่รู้ตัวจนกว่าจะไปเจอตัวเลขแปลกๆ ในรายงาน
//
// (ไฟล์ Excel ต้นฉบับเจอปัญหาเดียวกันแต่หนักกว่า — ได้มูลค่าคงเหลือติดลบ ซึ่งเป็นไปไม่ได้ทางบัญชี)

export interface OpeningBalanceInput {
  cost: number;
  purchaseDate: Date;
  openingAccumDepr?: number | null;
  openingAsOfDate?: Date | null;
}

/**
 * 🌟 [opening_fix] แปลงค่าดิบจาก request ให้เป็นค่าที่พร้อมบันทึกลง DB
 *
 * ⚠️ ทำไมต้องมีฟังก์ชันนี้ — เคยเกิดบั๊กที่ "ค่าที่เอาไปตรวจ" กับ "ค่าที่เอาไปบันทึก"
 * เขียนเงื่อนไขแยกกันคนละที่ใน route เดียวกัน แล้วเงื่อนไขฝั่งบันทึกลืมเช็ค null:
 *
 *     openingAccumDepr !== undefined && openingAccumDepr !== "" ? Number(...) : null
 *
 * หน้าจอส่ง null มาเมื่อผู้ใช้ไม่กรอก -> ผ่านทั้งสองเงื่อนไข -> Number(null) = 0
 * ทรัพย์สินทุกชิ้นที่สร้างโดยไม่กรอกยอดยกมาจึงถูกบันทึกว่า "ยอดยกมา = 0"
 * ซึ่งต่างจาก null อย่างสิ้นเชิงในสายตา engine (0 = ยืนยันว่าไม่เคยเสื่อม, null = ไม่มีข้อมูล)
 *
 * ต่อไปนี้ทั้ง validate และ persist ต้องเรียกฟังก์ชันนี้ตัวเดียวกัน จะได้ไม่มีทางหลุดอีก
 */
export function normalizeOpeningAmount(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function normalizeOpeningDate(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const d = new Date(raw as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 🌟 [opening_fix] ยอดยกมาที่ใช้งานได้จริงต้องมาเป็น "คู่" เสมอ
 *
 * กรณี 0 + ไม่มีวันที่ ถือว่าไม่มีข้อมูล ไม่ใช่ข้อผิดพลาด — เพราะ "เสื่อมสะสมมาแล้ว 0 บาท
 * ณ วันที่ไม่รู้" ไม่ได้บอกอะไรเลย เทียบเท่ากับไม่กรอก จึงล้างเป็น null ทั้งคู่แล้วไปต่อ
 *
 * เหตุผลเชิงปฏิบัติ: ข้อมูลเก่าที่ติดบั๊กด้านบนอยู่ในสภาพนี้พอดี (0 + null)
 * ถ้าตอบ 400 ผู้ใช้จะแก้ทรัพย์สินชิ้นนั้นไม่ได้เลยแม้แต่การเปลี่ยนชื่อ — ติดตายถาวร
 * ส่วนยอดที่มากกว่า 0 แต่ไม่มีวันที่ ยังต้องเตือนเหมือนเดิม เพราะนั่นคือข้อมูลที่ตั้งใจกรอกแต่กรอกไม่ครบ
 */
export function resolveOpeningBalance(rawAmount: unknown, rawDate: unknown): {
  openingAccumDepr: number | null;
  openingAsOfDate: Date | null;
} {
  const amount = normalizeOpeningAmount(rawAmount);
  const date = normalizeOpeningDate(rawDate);

  if (date === null && (amount === null || amount === 0)) {
    return { openingAccumDepr: null, openingAsOfDate: null };
  }
  return { openingAccumDepr: amount, openingAsOfDate: date };
}

/** คืนข้อความ error ถ้าข้อมูลไม่สมเหตุสมผล / คืน null ถ้าผ่าน */
export function validateOpeningBalance(input: OpeningBalanceInput): string | null {
  const { cost, purchaseDate, openingAccumDepr, openingAsOfDate } = input;

  const hasAmount = openingAccumDepr !== null && openingAccumDepr !== undefined;
  const hasDate = openingAsOfDate !== null && openingAsOfDate !== undefined;

  // ต้องกรอกคู่กันเสมอ ไม่งั้น engine ไม่รู้ว่าจะเริ่มนับจากวันไหน
  if (hasAmount !== hasDate) {
    return "ถ้ากรอกยอดยกมา ต้องระบุวันที่ของยอดยกมาด้วย (และในทางกลับกัน)";
  }

  if (!hasAmount || !hasDate) return null; // ไม่ได้กรอกยอดยกมา ไม่ต้องตรวจต่อ

  const amount = Number(openingAccumDepr);
  const asOf = openingAsOfDate as Date;

  if (!Number.isFinite(amount) || amount < 0) {
    return "ค่าเสื่อมสะสมยกมาต้องเป็นตัวเลขที่ไม่ติดลบ";
  }

  // 🔒 วันที่ยอดยกมาต้องไม่อยู่ก่อนวันที่ซื้อ — ของที่ยังไม่ได้ซื้อจะเสื่อมราคาไม่ได้
  if (asOf < purchaseDate) {
    return "วันที่ของยอดยกมาอยู่ก่อนวันที่ซื้อ ซึ่งเป็นไปไม่ได้ กรุณาตรวจสอบวันที่อีกครั้ง";
  }

  // 🔒 ยอดยกมาต้องไม่เกินมูลค่าที่เสื่อมได้จริง (ราคาทุน - มูลค่าคงเหลือ 1 บาท)
  const residual = cost >= 1 ? 1 : 0;
  const maxDepreciable = Math.max(0, cost - residual);
  if (amount > maxDepreciable) {
    return `ค่าเสื่อมสะสมยกมาต้องไม่เกิน ${maxDepreciable.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} บาท (ราคาทุนหักมูลค่าคงเหลือ 1 บาท)`;
  }

  return null;
}
