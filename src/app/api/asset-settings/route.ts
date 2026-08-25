// src/app/api/asset-settings/route.ts
// 🌟 [phase2asset_#16] ตั้งค่าระดับโมดูล Asset — ตอนนี้มีแค่ nearExpiryWarningDays (ค่าเริ่มต้น 0 = ยังไม่เตือน)
// เป็น singleton row (id=1) lazy-seed ตอนเรียก GET ครั้งแรกถ้ายังไม่มี
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";

// 🔒 [security] อ่านได้ทุก role ที่ล็อกอิน · แก้ได้เฉพาะ ADMIN และ ASSET
// ⚠️ เป็นการตั้งค่าระดับระบบ (singleton) ไม่ได้แยกตามบริษัท การแก้จึงมีผลกับทุกบริษัท
export async function GET(request: NextRequest) {
  try {
    const { denied } = await guard(request);
    if (denied) return denied;

    let settings = await prisma.assetModuleSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.assetModuleSettings.create({
        data: { id: 1, nearExpiryWarningDays: 0 },
      });
    }
    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    console.error("GET AssetModuleSettings Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลการตั้งค่าไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { denied } = await guard(request, ["ADMIN", "ASSET"]);
    if (denied) return denied;

    const body = await request.json();
    const days = Number(body.nearExpiryWarningDays);
    if (!Number.isInteger(days) || days < 0) {
      return NextResponse.json({ error: "จำนวนวันต้องเป็นเลขจำนวนเต็มไม่ติดลบ" }, { status: 400 });
    }

    // 🌟 [residual_option] ไม่ส่งมา = คงค่าเดิม (true เป็นค่าเริ่มต้นตอนสร้างแถวแรก)
    const enforceResidual =
      body.enforceResidualValue === undefined ? undefined : body.enforceResidualValue === true;

    const settings = await prisma.assetModuleSettings.upsert({
      where: { id: 1 },
      update: {
        nearExpiryWarningDays: days,
        ...(enforceResidual !== undefined ? { enforceResidualValue: enforceResidual } : {}),
      },
      create: {
        id: 1,
        nearExpiryWarningDays: days,
        enforceResidualValue: enforceResidual ?? true,
      },
    });
    return NextResponse.json({ message: "บันทึกการตั้งค่าสำเร็จ", data: settings }, { status: 200 });
  } catch (error) {
    console.error("PUT AssetModuleSettings Error:", error);
    return NextResponse.json({ error: "บันทึกการตั้งค่าไม่สำเร็จ" }, { status: 500 });
  }
}
