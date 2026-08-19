// src/middleware.ts
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  const { pathname } = req.nextUrl;

  // ==========================================
  // 🔒 โซน 1: ป้องกัน API (ป้องกันคนนอกยิง Postman)
  // ==========================================
  if (pathname.startsWith("/api/companies")) {
    // 🌟 [module_company] ADMIN / HR / ASSET เรียกได้ แต่ผลลัพธ์ถูกกรองตาม module + เครือบริษัท
    // ในตัว route เอง (ดู src/app/api/companies/route.ts) — ASSET จะเห็นเฉพาะบริษัทที่เปิด module Assessment
    const allowedApiRoles = ["ADMIN", "HR", "ASSET"];
    if (!token || !allowedApiRoles.includes(token.role as string)) {
      return NextResponse.json(
        { error: "Unauthorized: Access Denied" },
        { status: 401 },
      );
    }

    // 🌟 ASSET อ่านได้อย่างเดียว ห้ามสร้าง/แก้ไข/ลบบริษัท (งานนั้นเป็นของ ADMIN/HR)
    if (token.role === "ASSET" && req.method !== "GET") {
      return NextResponse.json(
        { error: "Access Denied: สิทธิ์ Assessment ไม่สามารถแก้ไขข้อมูลบริษัทได้" },
        { status: 403 },
      );
    }
  }

  // ==========================================
  // 📦 โซน 4: ฝั่งทรัพย์สิน (/asset/...) — สำหรับ role ASSET (ธีม Employee)
  // 🌟 [asset_portal] ADMIN เข้าได้ด้วยเพื่อความสะดวกในการตรวจสอบ
  // ==========================================
  if (pathname.startsWith("/asset")) {
    if (!token)
      return NextResponse.redirect(new URL("/employee/login", req.url));

    if (token.role !== "ASSET" && token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/employee/payslips", req.url));
    }
  }

  // ==========================================
  // 👑 โซน 2: ฝั่งแอดมิน (/admin/...)
  // ==========================================
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();
    if (!token) return NextResponse.redirect(new URL("/admin/login", req.url));

    // 🌟 [asset_portal] role ASSET ไม่ใช่ผู้ดูแลระบบ ให้เด้งไปโซน /asset ของตัวเอง
    if (token.role === "ASSET") {
      return NextResponse.redirect(new URL("/asset/register", req.url));
    }

    // 🌟 1. อนุญาตให้ทั้ง ADMIN และ HR เข้าใช้งานโซน Admin ได้
    if (token.role !== "ADMIN" && token.role !== "HR") {
      return NextResponse.redirect(new URL("/employee/payslips", req.url));
    }

    // 🌟 2. (โบนัสความปลอดภัย) ดักไม่ให้ HR พิมพ์ URL แอบเข้าหน้า Summary (เพราะหน้านี้สงวนให้ ADMIN)
    if (pathname.startsWith("/admin/summary") && token.role !== "ADMIN") {
      // ถ้าเป็น HR แอบเข้ามา จะเด้งกลับไปหน้า Company ให้เอง
      return NextResponse.redirect(new URL("/admin/company", req.url));
    }
  }

  // ==========================================
  // 👨‍💼 โซน 3: ฝั่งพนักงาน (/employee/...)
  // ==========================================
  if (pathname.startsWith("/employee")) {
    if (pathname === "/employee/login") return NextResponse.next();
    if (!token)
      return NextResponse.redirect(new URL("/employee/login", req.url));

    // 🌟 [asset_portal] role ASSET เห็นเฉพาะเมนู Asset ไม่ต้องเข้าหน้าสลิปเงินเดือน
    if (token.role === "ASSET") {
      return NextResponse.redirect(new URL("/asset/register", req.url));
    }
  }

  return NextResponse.next();
}

// 🌟 อย่าลืมเพิ่ม /api/companies ลงใน matcher ด้วย ยามจะได้ทำงานตรงนี้!
export const config = {
  matcher: [
    "/admin/:path*",
    "/employee/:path*",
    "/asset/:path*",
    "/api/companies/:path*",
  ],
};
