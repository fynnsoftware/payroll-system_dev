// src/app/api/assets/next-code/route.ts
// 🌟 [asset_code] หารหัสทรัพย์สินว่างถัดไปของประเภทที่เลือก
//
// รูปแบบรหัส: PREFIX-YYYYMMDD-0001  เช่น C-20260906-0001
//   PREFIX   = รหัสนำหน้าของประเภททรัพย์สิน (ตั้งที่หน้า Settings)
//   YYYYMMDD = วันที่สร้างรายการ
//   0001     = เลขรัน 4 หลัก เริ่มใหม่ทุกวัน แยกตามประเภท
//
// ⚠️ ทำไมต้องถามที่ server ไม่คำนวณเองที่ client:
// หน้าทะเบียนโหลดทรัพย์สินมาแค่ชุดที่ผ่านตัวกรองและแบ่งหน้าแล้ว ไม่ได้มีครบทั้งบริษัท
// ถ้าเดาเลขจากรายการที่เห็นอยู่ จะได้รหัสที่ซ้ำกับตัวที่ไม่ได้โหลดมา แล้วไปเด้ง unique ตอนกดบันทึก
//
// หมายเหตุ: ค่าที่คืนเป็นแค่ "ข้อเสนอ" ตอนกดบันทึกจริง POST /api/assets ยัง generate ใหม่
// พร้อมข้ามรหัสที่ถูกใช้ไปแล้วอีกชั้น จึงไม่มีปัญหาแม้มีคนสร้างแทรกระหว่างนั้น
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";
import { getToken } from "next-auth/jwt";
import { getAssetCompanyIds, isAssetCompanyAllowed } from "@/lib/assetScope";
import { bangkokDateStamp } from "@/lib/datetime";

const RUNNING_WIDTH = 4; // 0001

export async function GET(request: NextRequest) {
  try {
    const { denied } = await guard(request);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const categoryId = Number(searchParams.get("categoryId"));
    if (!Number.isInteger(categoryId)) {
      return NextResponse.json({ error: "ไม่ได้ระบุประเภททรัพย์สิน" }, { status: 400 });
    }

    const category = await prisma.assetCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.companyId === null) {
      return NextResponse.json({ error: "ไม่พบประเภททรัพย์สินนี้" }, { status: 404 });
    }

    const token = await getToken({ req: request });
    const allowed = await getAssetCompanyIds(token);
    if (!isAssetCompanyAllowed(allowed, category.companyId)) {
      return NextResponse.json({ error: "ไม่พบประเภททรัพย์สินนี้" }, { status: 404 });
    }

    // ประเภทที่ไม่ได้ตั้ง prefix ไว้ = ไม่ช่วยเติมรหัสให้ ผู้ใช้พิมพ์เอง
    const prefix = category.codePrefix;
    if (!prefix) {
      return NextResponse.json({ nextCode: null, prefix: null }, { status: 200 });
    }

    // ฐานของรหัสวันนี้ เช่น "C-20260906-"
    // 🌟 [timezone] วันที่ในรหัสยึดเวลาไทยเสมอ ไม่ใช่เวลา UTC ของ Vercel
    // (ถ้าใช้ UTC ทรัพย์สินที่สร้างช่วง 00:00-07:00 น. จะได้วันที่ของเมื่อวาน)
    //
    // ใช้ "วันที่สร้างรายการ" ไม่ใช่วันที่ซื้อ เพราะถ้าผูกกับวันที่ซื้อ รหัสจะเปลี่ยนไปมา
    // ระหว่างที่ผู้ใช้ยังกรอกฟอร์มไม่เสร็จ และอาจเผลอบันทึกรหัสที่ไม่ได้ตั้งใจ
    const base = `${prefix}-${bangkokDateStamp()}-`;

    // ⚠️ ค้นทั้งระบบไม่ใช่แค่บริษัทนี้ เพราะ Asset.assetCode เป็น unique ทั้งตาราง
    // ถ้าดูเฉพาะบริษัทตัวเองจะเสนอรหัสที่บริษัทอื่นใช้ไปแล้ว
    const existing = await prisma.asset.findMany({
      where: { assetCode: { startsWith: base } },
      select: { assetCode: true },
    });

    // หาเลขสูงสุดของวันนี้แล้วรันต่อ
    // (ไม่ใช้ "ช่องว่างแรกที่เจอ" เพราะรหัสที่เคยลบทิ้งไปแล้วไม่ควรถูกนำกลับมาใช้ซ้ำ
    //  ทรัพย์สินคนละชิ้นที่มีรหัสเดียวกันคนละช่วงเวลา จะทำให้ตามประวัติย้อนหลังไม่ได้)
    let maxNum = 0;
    for (const a of existing) {
      const tail = a.assetCode.slice(base.length);
      // ต้องเป็นตัวเลขล้วนเท่านั้น กันรหัสที่คนพิมพ์เองแปลกๆ เช่น "C-20260906-A1" มากวนการนับ
      if (!/^\d+$/.test(tail)) continue;
      const n = parseInt(tail, 10);
      if (n > maxNum) maxNum = n;
    }

    const nextCode = `${base}${String(maxNum + 1).padStart(RUNNING_WIDTH, "0")}`;
    return NextResponse.json({ nextCode, prefix }, { status: 200 });
  } catch (error) {
    console.error("GET next asset code Error:", error);
    return NextResponse.json({ error: "หารหัสถัดไปไม่สำเร็จ" }, { status: 500 });
  }
}
