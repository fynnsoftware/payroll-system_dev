// src/lib/datetime.ts
// 🌟 [timezone] ทุกอย่างที่เกี่ยวกับ "วันที่/เวลา" ในระบบยึดเวลาไทย (GMT+7, Asia/Bangkok)
//
// ⚠️ ปัญหาที่ไฟล์นี้แก้:
// Vercel รัน serverless function ด้วยเวลา UTC ส่วนเบราว์เซอร์ใช้เวลาเครื่องผู้ใช้
// ถ้าปล่อยให้แต่ละจุดเรียก new Date().getFullYear() เองจะเพี้ยนได้จริง 2 กรณี:
//   1. ช่วง 00:00-06:59 น. เวลาไทย ฝั่ง UTC ยังเป็น "เมื่อวาน" อยู่
//      -> 1 ม.ค. เช้าไทย ระบบจะคิดว่ายังเป็นปีที่แล้ว รายงานและการปิดงวดจะผิดปีทั้งหมด
//      -> รหัสทรัพย์สินที่มีวันที่ (PREFIX-YYYYMMDD-0001) จะได้วันที่ของเมื่อวาน
//   2. ผู้ใช้ที่เปิดหน้าจอจากคนละ timezone จะเห็นวันที่ไม่ตรงกับคนที่นั่งอยู่ไทย
//
// ✅ วิธีคิด: บวก offset +7 ชั่วโมงแล้วอ่านค่าด้วย getUTC* เสมอ
// ใช้ offset ตายตัวแทน Intl/timeZone เพราะประเทศไทยเป็น UTC+7 คงที่ ไม่มี DST มาตั้งแต่ปี 1920
// จึงไม่ต้องพึ่งข้อมูล timezone ของ runtime (ซึ่งบาง environment ตัด ICU ออก)
//
// ⚠️ สิ่งที่ไฟล์นี้ "ไม่" แตะ: ตัวคำนวณค่าเสื่อมราคาใน depreciation.ts
// ฟิลด์วันที่ซื้อ/วันที่ยอดยกมา เก็บเป็นวันที่ล้วน (เที่ยงคืน UTC) ตามที่ input type="date" ส่งมา
// engine อ่านด้วย getUTC* ซึ่งถูกต้องและตรงกับ Excel ต้นฉบับที่ทดสอบไว้แล้ว
// ถ้าไปบวก offset ตรงนั้นด้วย วันที่จะขยับและตัวเลขทางบัญชีทั้งระบบจะเปลี่ยน

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** แปลงเป็น Date ที่อ่านด้วย getUTC* แล้วได้เวลานาฬิกาไทย (ห้ามเอาไปบันทึกลง DB) */
function toBangkokClock(value?: Date | string | number | null): Date | null {
  const d =
    value === undefined || value === null
      ? new Date()
      : value instanceof Date
        ? value
        : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + BANGKOK_OFFSET_MS);
}

export interface BangkokParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** แตกวันที่/เวลาเป็นส่วนๆ ตามเวลาไทย */
export function bangkokParts(value?: Date | string | number | null): BangkokParts | null {
  const d = toBangkokClock(value);
  if (!d) return null;
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

/** ปีปัจจุบันตามเวลาไทย — ใช้แทน new Date().getFullYear() ทุกที่ */
export function bangkokYear(value?: Date | string | number | null): number {
  return bangkokParts(value)!.year;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** YYYYMMDD ตามเวลาไทย เช่น 20260906 (ใช้ในรหัสทรัพย์สิน) */
export function bangkokDateStamp(value?: Date | string | number | null): string {
  const p = bangkokParts(value)!;
  return `${p.year}${pad(p.month)}${pad(p.day)}`;
}

/** YYYYMMDDHHmm ตามเวลาไทย (ใช้ต่อท้ายรหัสบริษัทตอน terminate) */
export function bangkokTimestamp(value?: Date | string | number | null): string {
  const p = bangkokParts(value)!;
  return `${bangkokDateStamp(value)}${pad(p.hour)}${pad(p.minute)}`;
}

/** yyyy-mm-dd ตามเวลาไทย — รูปแบบที่ input type="date" ต้องการ */
export function toDateInputValue(value: Date | string | null | undefined): string {
  const p = bangkokParts(value ?? null);
  if (!value || !p) return "";
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * 🌟 รูปแบบวันที่มาตรฐานของทั้งระบบ: dd/Mmm/yyyy เช่น 01/Jan/2026
 *
 * ทำไมใช้ชื่อเดือนเป็นตัวอักษรแทนตัวเลข:
 * 01/02/2026 อ่านได้ 2 แบบ (1 ก.พ. แบบไทย/อังกฤษ หรือ 2 ม.ค. แบบอเมริกัน)
 * พอเป็น 01/Feb/2026 ก็ไม่มีทางอ่านผิด ซึ่งสำคัญมากกับเอกสารทางบัญชี
 *
 * ⚠️ ห้ามใช้ toLocaleDateString('th-TH') ในระบบนี้ เพราะจะได้ปี พ.ศ. (เช่น 1/2/2563)
 * ผู้ใช้กรอกวันที่ซื้อเป็น ค.ศ. ผ่าน input type="date" แต่ผลลัพธ์แสดงเป็น พ.ศ.
 * จะสับสนว่าระบบคำนวณผิดหรือเปล่า
 *
 * ⚠️ เดือนเป็นภาษาอังกฤษตายตัว ไม่ใช้ locale ของเบราว์เซอร์
 * เพื่อให้ทุกคนเห็นเหมือนกันไม่ว่าตั้งค่าเครื่องไว้ภาษาอะไร
 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const p = bangkokParts(value);
  if (!p) return "-";
  return `${pad(p.day)}/${MONTHS_SHORT[p.month - 1]}/${p.year}`;
}

/** dd/Mmm/yyyy HH:mm ตามเวลาไทย — สำหรับ timestamp จริง เช่น createdAt, terminatedAt */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const p = bangkokParts(value);
  if (!p) return "-";
  return `${formatDate(value)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * @deprecated ใช้ formatDate() แทน — เหลือไว้ไม่ให้ import เดิมพัง
 * เดิมให้รูปแบบ "6 Sep 2026" ตอนนี้รวมเป็นรูปแบบเดียวกับทั้งระบบแล้ว
 */
export function formatDateLong(value: Date | string | null | undefined): string {
  return formatDate(value);
}
