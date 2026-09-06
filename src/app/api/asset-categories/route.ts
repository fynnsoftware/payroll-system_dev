// src/app/api/asset-categories/route.ts
// 🌟 [per_company] ประเภททรัพย์สินแยกขาดตามบริษัทแล้ว — ทุก request ต้องระบุ companyId
//
// 🔒 [security] เห็นได้เฉพาะบริษัทที่ user มีสิทธิ์ (membership + module Assessment)
// เพิ่ม/แก้/ลบ ได้เฉพาะ ADMIN และ ASSET ที่มีสิทธิ์ในบริษัทนั้น
//
// ⚠️ เดิมเป็นตารางกลางทั้งระบบและเปิดให้ ASSET เพิ่มได้แต่แก้/ลบไม่ได้ เพราะกลัวกระทบข้ามบริษัท
// พอแยกตามบริษัทแล้ว ข้อจำกัดนั้นไม่จำเป็นอีก แก้/ลบของตัวเองได้เต็มที่
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";
import { getToken } from "next-auth/jwt";
import { getAssetCompanyIds, isAssetCompanyAllowed, explainAssetAccessDenied } from "@/lib/assetScope";
import { ensureCompanyAssetMasterData } from "@/lib/assetMasterData";

/**
 * 🌟 [asset_code] normalize prefix รหัสทรัพย์สิน
 * ตัดช่องว่าง + แปลงเป็นตัวพิมพ์ใหญ่ เพื่อไม่ให้ "c" กับ "C" กลายเป็นคนละ prefix
 * คืน null ถ้าเว้นว่าง (= ประเภทนี้ไม่ช่วยเติมรหัสให้)
 */
function normalizePrefix(raw: unknown): { value: string | null; error?: string } {
  if (raw === undefined || raw === null || String(raw).trim() === "") return { value: null };
  const v = String(raw).trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,10}$/.test(v)) {
    return { value: null, error: "รหัสนำหน้าใช้ได้เฉพาะ A-Z, 0-9 และ - ความยาวไม่เกิน 10 ตัว" };
  }
  // ลงท้ายด้วยตัวเลขจะทำให้ตัวแยกรหัสอ่านผิด เช่น "A1" + เลขรัน 001 -> "A1001" ซึ่ง parse กลับได้ A1001 ไม่ใช่ A1-001
  if (/\d$/.test(v)) {
    return { value: null, error: "รหัสนำหน้าห้ามลงท้ายด้วยตัวเลข เพราะจะทำให้ระบบรันเลขต่อผิด" };
  }
  return { value: v };
}

/**
 * 🌟 [account_link] ตรวจว่าผังบัญชีที่เลือกเป็นของบริษัทเดียวกันจริง
 * ⚠️ ต้องเช็คที่ server ด้วย ไม่ใช่แค่กรอง dropdown ฝั่งหน้าจอ
 * ไม่งั้นยิง API ตรงๆ แล้วผูกประเภททรัพย์สินไปที่ผังบัญชีของบริษัทอื่นได้
 */
async function resolveAccountTypeId(
  raw: unknown,
  companyId: number,
): Promise<{ value: number | null; error?: string }> {
  if (raw === undefined || raw === null || String(raw).trim() === "") return { value: null };
  const id = Number(raw);
  if (!Number.isInteger(id)) return { value: null, error: "ประเภทบัญชีไม่ถูกต้อง" };

  const row = await prisma.assetAccountType.findUnique({ where: { id } });
  if (!row || row.companyId !== companyId) {
    return { value: null, error: "ประเภทบัญชีที่เลือกไม่ได้อยู่ในบริษัทนี้" };
  }
  return { value: id };
}

/** อ่าน companyId จาก query แล้วเช็คสิทธิ์ — คืน error response ถ้าไม่ผ่าน */
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

    // seed ชุดตั้งต้นให้บริษัทที่ยังไม่เคยมี (รวมถึงบริษัทเก่าที่สร้างก่อนฟีเจอร์นี้)
    await ensureCompanyAssetMasterData(companyId);

    const categories = await prisma.assetCategory.findMany({
      where: { companyId },
      include: { accountType: { select: { id: true, code: true, name: true } } },
      orderBy: { id: "asc" },
    });
    return NextResponse.json(categories, { status: 200 });
  } catch (error) {
    console.error("GET AssetCategory Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลประเภททรัพย์สินไม่สำเร็จ" }, { status: 500 });
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
    if (!name) {
      return NextResponse.json({ error: "กรุณาระบุชื่อประเภททรัพย์สิน" }, { status: 400 });
    }

    const prefix = normalizePrefix(body.codePrefix);
    if (prefix.error) return NextResponse.json({ error: prefix.error }, { status: 400 });

    const account = await resolveAccountTypeId(body.accountTypeId, resolved.companyId!);
    if (account.error) return NextResponse.json({ error: account.error }, { status: 400 });

    const category = await prisma.assetCategory.create({
      data: {
        name,
        codePrefix: prefix.value,
        accountTypeId: account.value,
        companyId: resolved.companyId!,
      },
    });
    return NextResponse.json({ message: "เพิ่มประเภททรัพย์สินสำเร็จ", data: category }, { status: 201 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "บริษัทนี้มีประเภททรัพย์สินชื่อนี้ หรือรหัสนำหน้านี้อยู่แล้ว" }, { status: 400 });
    }
    console.error("POST AssetCategory Error:", error);
    return NextResponse.json({ error: "เพิ่มประเภททรัพย์สินไม่สำเร็จ" }, { status: 500 });
  }
}
