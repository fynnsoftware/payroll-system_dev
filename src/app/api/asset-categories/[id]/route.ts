// src/app/api/asset-categories/[id]/route.ts
// 🔒 [per_company] แก้/ลบได้เฉพาะประเภทที่อยู่ในบริษัทที่ user มีสิทธิ์
//
// ⚠️ การลบยังถูก FK กันไว้อีกชั้น (Asset.categoryId เป็น required relation -> Restrict)
// ลบได้เฉพาะประเภทที่ยังไม่มีทรัพย์สินผูกอยู่ ดักเป็น P2003
// พอแยกตามบริษัทแล้ว ข้อความ error จะตรงกับสิ่งที่ผู้ใช้เห็นจริงในหน้าจอตัวเอง
// (เดิมอาจถูกบล็อกเพราะทรัพย์สินของบริษัทอื่นที่ตัวเองมองไม่เห็น)
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";
import { getToken } from "next-auth/jwt";
import { getAssetCompanyIds, isAssetCompanyAllowed } from "@/lib/assetScope";

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

/** เช็คว่าประเภทนี้อยู่ในบริษัทที่ user เข้าถึงได้ */
async function guardCategory(request: NextRequest, id: number) {
  const category = await prisma.assetCategory.findUnique({ where: { id } });
  if (!category) {
    return { denied: NextResponse.json({ error: "ไม่พบประเภททรัพย์สินนี้" }, { status: 404 }) };
  }
  // แถวเก่าที่ยังไม่มีเจ้าของ (companyId = null) ห้ามแตะจนกว่าจะย้ายข้อมูลเสร็จ
  if (category.companyId === null) {
    return { denied: NextResponse.json(
      { error: "ประเภทนี้เป็นข้อมูลเก่าที่ยังไม่ได้ย้ายเข้าบริษัท กรุณาติดต่อผู้ดูแลระบบ" },
      { status: 400 },
    ) };
  }

  const token = await getToken({ req: request });
  const allowed = await getAssetCompanyIds(token);
  if (!isAssetCompanyAllowed(allowed, category.companyId)) {
    // ตอบ 404 แทน 403 เพื่อไม่ให้รู้ว่ามีประเภท id นี้อยู่จริงในบริษัทอื่น
    return { denied: NextResponse.json({ error: "ไม่พบประเภททรัพย์สินนี้" }, { status: 404 }) };
  }
  return { category };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { denied } = await guard(request, ["ADMIN", "ASSET"]);
    if (denied) return denied;

    const { id } = await params;
    const guarded = await guardCategory(request, Number(id));
    if (guarded.denied) return guarded.denied;

    const body = await request.json();
    const name = (body.name as string)?.trim();
    if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อประเภททรัพย์สิน" }, { status: 400 });

    const prefix = normalizePrefix(body.codePrefix);
    if (prefix.error) return NextResponse.json({ error: prefix.error }, { status: 400 });

    const account = await resolveAccountTypeId(body.accountTypeId, guarded.category!.companyId!);
    if (account.error) return NextResponse.json({ error: account.error }, { status: 400 });

    const updated = await prisma.assetCategory.update({
      where: { id: Number(id) },
      data: { name, codePrefix: prefix.value, accountTypeId: account.value },
    });
    return NextResponse.json({ message: "อัปเดตสำเร็จ", data: updated }, { status: 200 });
  } catch (error: any) {
    if (error.code === "P2002") return NextResponse.json({ error: "บริษัทนี้มีประเภททรัพย์สินชื่อนี้ หรือรหัสนำหน้านี้อยู่แล้ว" }, { status: 400 });
    console.error("PUT AssetCategory Error:", error);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { denied } = await guard(request, ["ADMIN", "ASSET"]);
    if (denied) return denied;

    const { id } = await params;
    const guarded = await guardCategory(request, Number(id));
    if (guarded.denied) return guarded.denied;

    // 🌟 นับให้ก่อนเพื่อบอกจำนวนในข้อความ error — ผู้ใช้จะได้รู้ว่าต้องไปจัดการกี่รายการ
    const inUse = await prisma.asset.count({ where: { categoryId: Number(id) } });
    if (inUse > 0) {
      return NextResponse.json(
        { error: `ลบไม่ได้ เพราะมีทรัพย์สิน ${inUse} รายการใช้ประเภทนี้อยู่ กรุณาย้ายไปประเภทอื่นก่อน` },
        { status: 400 },
      );
    }

    await prisma.assetCategory.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: "ลบสำเร็จ" }, { status: 200 });
  } catch (error: any) {
    if (error.code === "P2003") {
      return NextResponse.json({ error: "ไม่สามารถลบได้ เนื่องจากมีทรัพย์สินใช้ประเภทนี้อยู่" }, { status: 400 });
    }
    console.error("DELETE AssetCategory Error:", error);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
