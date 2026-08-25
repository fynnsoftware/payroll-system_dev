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
