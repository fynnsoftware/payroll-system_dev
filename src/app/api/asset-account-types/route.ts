// src/app/api/asset-account-types/route.ts
// 🌟 [per_company] ประเภทบัญชี (ผังบัญชี) — รหัสบัญชี + ชื่อบัญชี แยกตามบริษัท
// ค่าตั้งต้น: 10000000 สินทรัพย์ / 11000000 สินทรัพย์หมุนเวียน (ดู src/lib/assetMasterData.ts)
//
// 🔒 [security] เห็น/แก้ได้เฉพาะบริษัทที่ user มีสิทธิ์ (membership + module Assessment)
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";
import { getToken } from "next-auth/jwt";
import { getAssetCompanyIds, isAssetCompanyAllowed, explainAssetAccessDenied } from "@/lib/assetScope";
import { ensureCompanyAssetMasterData } from "@/lib/assetMasterData";

/**
 * 🌟 [account_code] รหัสบัญชีต้องเป็นตัวเลขล้วน 8 หลักเท่านั้น
 *
 * ⚠️ ตรวจที่ server ด้วย ไม่ใช่แค่ maxLength ที่ช่องกรอก
 * maxLength กัน "พิมพ์เกิน" ได้ แต่กัน "พิมพ์ขาด" ไม่ได้ และยิง API ตรงๆ ก็ข้ามได้ทั้งหมด
 *
 * แยกข้อความ error 2 แบบ (ไม่ใช่ตัวเลข vs จำนวนหลักไม่ครบ) เพราะผู้ใช้แก้คนละวิธี
 */
function validateAccountCode(raw: unknown): { value: string; error?: string } {
  const v = String(raw ?? "").trim();
  if (!/^\d*$/.test(v)) {
    return { value: v, error: "รหัสบัญชีต้องเป็นตัวเลขเท่านั้น" };
  }
  if (v.length !== 8) {
    return { value: v, error: `รหัสบัญชีต้องมี 8 หลักพอดี (ตอนนี้ ${v.length} หลัก)` };
  }
  return { value: v };
}


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

export async function GET(request: NextRequest) {
  try {
    const { denied } = await guard(request);
    if (denied) return denied;

    const resolved = await resolveCompanyId(
      request,
      request.nextUrl.searchParams.get("companyId"),
    );
    if (resolved.error) return resolved.error;
    const companyId = resolved.companyId!;

    await ensureCompanyAssetMasterData(companyId);

    // เรียงตามรหัสบัญชี ไม่ใช่ตามลำดับที่สร้าง — ผังบัญชีอ่านตามรหัสถึงจะเห็นโครงสร้าง
    const accountTypes = await prisma.assetAccountType.findMany({
      where: { companyId },
      orderBy: { code: "asc" },
    });
    return NextResponse.json(accountTypes, { status: 200 });
  } catch (error) {
    console.error("GET AssetAccountType Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลประเภทบัญชีไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { denied } = await guard(request, ["ADMIN", "ASSET"]);
    if (denied) return denied;

    const body = await request.json();
    const resolved = await resolveCompanyId(request, body.companyId ?? null);
    if (resolved.error) return resolved.error;

    const name = (body.name as string)?.trim();
    if (!body.code || !name) {
      return NextResponse.json({ error: "กรุณากรอกทั้งรหัสบัญชีและชื่อบัญชี" }, { status: 400 });
    }

    const checked = validateAccountCode(body.code);
    if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 });

    const created = await prisma.assetAccountType.create({
      data: { code: checked.value, name, companyId: resolved.companyId! },
    });
    return NextResponse.json({ message: "เพิ่มประเภทบัญชีสำเร็จ", data: created }, { status: 201 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "บริษัทนี้มีรหัสบัญชีนี้อยู่แล้ว" }, { status: 400 });
    }
    console.error("POST AssetAccountType Error:", error);
    return NextResponse.json({ error: "เพิ่มประเภทบัญชีไม่สำเร็จ" }, { status: 500 });
  }
}
