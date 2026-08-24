// src/lib/apiGuard.ts
// 🔒 [security] ตัวช่วยเช็คสิทธิ์สำหรับ API route ที่ middleware ไม่ได้ครอบ
//
// ⚠️ ทำไมต้องมี: middleware matcher ครอบแค่ /admin, /employee, /asset, /api/companies
// route อื่นๆ ต้องเช็คเองในตัว route ไม่งั้นใครยิงตรงก็เข้าถึงได้ทั้งหมด
// ใช้ helper ตัวนี้แทนการ copy โค้ดเช็ค token ไปทุกไฟล์ จะได้ไม่มีที่ไหนตกหล่น
import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export interface GuardResult {
  /** ถ้าไม่ผ่าน จะมี response ให้ return ออกไปเลย */
  denied: NextResponse | null;
  /** token ของคนที่เรียก (null ถ้าไม่ผ่าน) */
  token: any | null;
}

/**
 * เช็คว่าล็อกอินแล้วหรือยัง และ (ถ้าระบุ allowedRoles) role อยู่ในรายการที่อนุญาตไหม
 *
 * ตัวอย่าง:
 *   const { denied, token } = await guard(request, ["ADMIN"]);
 *   if (denied) return denied;
 */
export async function guard(
  request: NextRequest,
  allowedRoles?: string[],
): Promise<GuardResult> {
  const token = await getToken({ req: request });

  if (!token) {
    return {
      denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      token: null,
    };
  }

  if (allowedRoles && !allowedRoles.includes(token.role as string)) {
    return {
      denied: NextResponse.json(
        { error: "Access Denied: ไม่มีสิทธิ์เข้าถึงส่วนนี้" },
        { status: 403 },
      ),
      token: null,
    };
  }

  return { denied: null, token };
}
