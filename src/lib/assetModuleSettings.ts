// src/lib/assetModuleSettings.ts
// 🌟 [residual_option] อ่านค่าตั้งค่าระดับโมดูล Asset (singleton row id=1)
//
// ⚠️ ทุกจุดที่คำนวณค่าเสื่อมต้องอ่านค่านี้แล้วส่งเข้า engine ให้ตรงกัน
// ถ้าจุดใดจุดหนึ่งลืมส่ง ตัวเลขในหน้านั้นจะไม่ตรงกับหน้าอื่น ซึ่งหาสาเหตุยากมาก
import { prisma } from "@/lib/prisma";
import { CalcOptions } from "@/lib/depreciation";

export interface AssetModuleSettingsValue {
  nearExpiryWarningDays: number;
  enforceResidualValue: boolean;
}

const DEFAULTS: AssetModuleSettingsValue = {
  nearExpiryWarningDays: 0,
  enforceResidualValue: true,
};

/** อ่านค่าตั้งค่า (สร้างแถวเริ่มต้นให้อัตโนมัติถ้ายังไม่มี) */
export async function getAssetModuleSettings(): Promise<AssetModuleSettingsValue> {
  try {
    const row = await prisma.assetModuleSettings.findUnique({ where: { id: 1 } });
    if (!row) return DEFAULTS;
    return {
      nearExpiryWarningDays: row.nearExpiryWarningDays,
      enforceResidualValue: row.enforceResidualValue,
    };
  } catch {
    // ถ้าอ่านไม่ได้ให้ใช้ค่าเริ่มต้นที่ปลอดภัยกว่า (คงมูลค่า 1 บาท) ดีกว่าคำนวณพลาด
    return DEFAULTS;
  }
}

/** แปลงเป็น options ที่ส่งเข้า calcAssetDepreciation ได้ตรงๆ */
export async function getCalcOptions(): Promise<CalcOptions> {
  const settings = await getAssetModuleSettings();
  return { enforceResidualValue: settings.enforceResidualValue };
}
