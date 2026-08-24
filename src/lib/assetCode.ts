// src/lib/assetCode.ts
// 🌟 [asset_duplicate] ตัวสร้างรหัสทรัพย์สินแบบรันต่อเนื่อง สำหรับการสร้างหลายรายการพร้อมกัน
//
// ⚠️ รหัสทรัพย์สินเป็น unique ทั้งระบบ การรันเลขต่อจึงต้องข้ามรหัสที่ถูกใช้ไปแล้วเสมอ
// ไม่ใช่แค่ +1 ไปเรื่อยๆ ไม่งั้นจะชนกับของเดิมแล้ว insert ล้มทั้งชุด

export interface ParsedAssetCode {
  prefix: string;
  num: number;
  width: number;
}

/**
 * แยกรหัสเป็น prefix + ตัวเลขท้าย เพื่อใช้รันต่อ
 *   "A001"    -> { prefix: "A",       num: 1, width: 3 }
 *   "AST-007" -> { prefix: "AST-",    num: 7, width: 3 }
 *   "COPIER"  -> { prefix: "COPIER-", num: 1, width: 2 }  (ไม่มีเลขท้าย ให้เติม -01 ต่อท้าย)
 */
export function parseAssetCode(code: string): ParsedAssetCode {
  const trimmed = code.trim();
  const matched = trimmed.match(/^(.*?)(\d+)$/);

  if (matched) {
    return {
      prefix: matched[1],
      num: parseInt(matched[2], 10),
      width: matched[2].length,
    };
  }

  return { prefix: `${trimmed}-`, num: 1, width: 2 };
}

/** ประกอบรหัสจาก prefix + เลข โดยเติมศูนย์นำหน้าให้ครบความยาวเดิม */
export function buildAssetCode(parsed: ParsedAssetCode, num: number): string {
  return `${parsed.prefix}${String(num).padStart(parsed.width, "0")}`;
}

/**
 * สร้างรหัสจำนวน quantity ตัว โดยเริ่มจาก baseCode แล้วรันเลขต่อ
 * ข้ามรหัสที่มีอยู่แล้วใน takenCodes อัตโนมัติ
 *
 * ตัวอย่าง: baseCode "A001", quantity 3, มี A002 อยู่แล้ว -> ได้ ["A001", "A003", "A004"]
 */
export function generateAssetCodes(
  baseCode: string,
  quantity: number,
  takenCodes: Set<string>,
): string[] {
  const parsed = parseAssetCode(baseCode);
  const result: string[] = [];

  let num = parsed.num;
  // กันลูปไม่รู้จบกรณีรหัสถูกใช้ไปเยอะผิดปกติ
  const maxAttempts = quantity * 100 + 1000;
  let attempts = 0;

  while (result.length < quantity && attempts < maxAttempts) {
    const candidate = buildAssetCode(parsed, num);
    if (!takenCodes.has(candidate)) {
      result.push(candidate);
      takenCodes.add(candidate); // กันซ้ำกันเองภายในชุดเดียวกัน
    }
    num++;
    attempts++;
  }

  return result;
}
