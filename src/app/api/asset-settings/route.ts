// src/app/api/asset-settings/route.ts
// 🌟 ตั้งค่าฝั่ง Asset — ตอนนี้แบ่งเป็น 2 ระดับ
//
//   ระดับบริษัท : nearExpiryWarningDays  (AssetCompanySettings — ต้องส่ง companyId)
//   ระดับระบบ  : enforceResidualValue    (AssetModuleSettings singleton id=1)
//
// ⚠️ [per_company] ทำไม enforceResidualValue ไม่แยกตามบริษัท:
// มันคือนโยบายบัญชีที่กำหนดว่ามูลค่าคงเหลือปิดที่ 1 บาทหรือปล่อยติดลบ ซึ่งควรเหมือนกันทั้งระบบ
// และการเปลี่ยนค่านี้ทีหนึ่งต้องล้างยอดปิดงวดของ "ทุกบริษัท" ทิ้งเพื่อคำนวณใหม่
// ถ้าแยกรายบริษัทจะต้องล้างเฉพาะบริษัทนั้น ซึ่งทำได้ แต่รายงานรวมเครือจะมีตัวเลข 2 วิธีปนกัน
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";
import { getToken } from "next-auth/jwt";
import { getAssetCompanyIds, isAssetCompanyAllowed, explainAssetAccessDenied } from "@/lib/assetScope";
import { invalidateAllAssetYearlyCloses } from "@/lib/assetCloseInvalidation";

async function resolveCompanyId(request: NextRequest, raw: string | null) {
  if (!raw) {
    return { error: NextResponse.json({ error: "กรุณาระบุบริษัท" }, { status: 400 }) };
  }
  const companyId = Number(raw);
  if (!Number.isInteger(companyId)) {
    return { error: NextResponse.json({ error: "รหัสบริษัทไม่ถูกต้อง" }, { status: 400 }) };
  }

  const token = await getToken({ req: request });
  const allowed = await getAssetCompanyIds(token);
  if (!isAssetCompanyAllowed(allowed, companyId)) {
    const reason = await explainAssetAccessDenied(token, companyId);
    return { error: NextResponse.json({ error: reason }, { status: 403 }) };
  }
  return { companyId };
}

/** อ่านค่ากลาง (สร้างแถวเริ่มต้นให้อัตโนมัติถ้ายังไม่มี) */
async function readGlobalSettings() {
  let settings = await prisma.assetModuleSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await prisma.assetModuleSettings.create({ data: { id: 1 } });
  }
  return settings;
}

// 🔒 [security] อ่านได้ทุก role ที่ล็อกอิน (ต้องมีสิทธิ์ในบริษัทที่ขอ) · แก้ได้เฉพาะ ADMIN และ ASSET
export async function GET(request: NextRequest) {
  try {
    const { denied } = await guard(request);
    if (denied) return denied;

    const resolved = await resolveCompanyId(
      request,
      request.nextUrl.searchParams.get("companyId"),
    );
    if (resolved.error) return resolved.error;

    const [companyRow, global] = await Promise.all([
      prisma.assetCompanySettings.findUnique({ where: { companyId: resolved.companyId! } }),
      readGlobalSettings(),
    ]);

    return NextResponse.json(
      {
        companyId: resolved.companyId,
        nearExpiryWarningDays: companyRow?.nearExpiryWarningDays ?? 0,
        enforceResidualValue: global.enforceResidualValue,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET AssetSettings Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลการตั้งค่าไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { denied } = await guard(request, ["ADMIN", "ASSET"]);
    if (denied) return denied;

    const body = await request.json();
    const resolved = await resolveCompanyId(request, body.companyId ?? null);
    if (resolved.error) return resolved.error;
    const companyId = resolved.companyId!;

    const days = Number(body.nearExpiryWarningDays);
    if (!Number.isInteger(days) || days < 0) {
      return NextResponse.json({ error: "จำนวนวันต้องเป็นเลขจำนวนเต็มไม่ติดลบ" }, { status: 400 });
    }

    await prisma.assetCompanySettings.upsert({
      where: { companyId },
      update: { nearExpiryWarningDays: days },
      create: { companyId, nearExpiryWarningDays: days },
    });

    // 🌟 [residual_option] ไม่ส่งมา = คงค่าเดิม
    const enforceResidual =
      body.enforceResidualValue === undefined ? undefined : body.enforceResidualValue === true;

    let residualChanged = false;
    if (enforceResidual !== undefined) {
      const before = await readGlobalSettings();
      residualChanged = before.enforceResidualValue !== enforceResidual;
      if (residualChanged) {
        await prisma.assetModuleSettings.update({
          where: { id: 1 },
          data: { enforceResidualValue: enforceResidual },
        });
        // วิธีคำนวณเปลี่ยน -> ยอดปิดงวดเดิมเป็นของกติกาเก่าทั้งระบบ ต้องล้างให้คำนวณใหม่
        await invalidateAllAssetYearlyCloses();
      }
    }

    return NextResponse.json(
      {
        message: residualChanged
          ? "บันทึกการตั้งค่าสำเร็จ — ระบบจะคำนวณยอดปิดงวดใหม่ทั้งหมดตามวิธีที่เลือก"
          : "บันทึกการตั้งค่าสำเร็จ",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("PUT AssetSettings Error:", error);
    return NextResponse.json({ error: "บันทึกการตั้งค่าไม่สำเร็จ" }, { status: 500 });
  }
}
