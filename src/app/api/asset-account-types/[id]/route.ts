// src/app/api/asset-account-types/[id]/route.ts
// 🔒 [per_company] แก้/ลบได้เฉพาะประเภทบัญชีที่อยู่ในบริษัทที่ user มีสิทธิ์
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";
import { getToken } from "next-auth/jwt";
import { getAssetCompanyIds, isAssetCompanyAllowed } from "@/lib/assetScope";

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


async function guardAccountType(request: NextRequest, id: number) {
  const row = await prisma.assetAccountType.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "ไม่พบประเภทบัญชีนี้" }, { status: 404 });
  if (row.companyId === null) {
    return NextResponse.json({ error: "รายการนี้ยังไม่ได้ผูกกับบริษัท" }, { status: 400 });
  }

  const token = await getToken({ req: request });
  const allowed = await getAssetCompanyIds(token);
  if (!isAssetCompanyAllowed(allowed, row.companyId)) {
    return NextResponse.json({ error: "ไม่พบประเภทบัญชีนี้" }, { status: 404 });
  }
  return null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { denied } = await guard(request, ["ADMIN", "ASSET"]);
    if (denied) return denied;

    const { id } = await params;
    const blocked = await guardAccountType(request, Number(id));
    if (blocked) return blocked;

    const body = await request.json();
    const name = (body.name as string)?.trim();
    if (!body.code || !name) {
      return NextResponse.json({ error: "กรุณากรอกทั้งรหัสบัญชีและชื่อบัญชี" }, { status: 400 });
    }

    const checked = validateAccountCode(body.code);
    if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 });

    const updated = await prisma.assetAccountType.update({
      where: { id: Number(id) },
      data: { code: checked.value, name },
    });
    return NextResponse.json({ message: "อัปเดตสำเร็จ", data: updated }, { status: 200 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "บริษัทนี้มีรหัสบัญชีนี้อยู่แล้ว" }, { status: 400 });
    }
    console.error("PUT AssetAccountType Error:", error);
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
    const blocked = await guardAccountType(request, Number(id));
    if (blocked) return blocked;

    // 🌟 [account_link] กันลบผังบัญชีที่ยังมีประเภททรัพย์สินผูกอยู่
    // schema ตั้ง onDelete: Restrict ไว้แล้ว แต่ดักตรงนี้เพื่อบอกชื่อประเภทที่ติดอยู่ให้ชัด
    // จะได้ไม่ต้องไปไล่เดาเองว่าต้องแก้ตรงไหนก่อน
    const linked = await prisma.assetCategory.findMany({
      where: { accountTypeId: Number(id) },
      select: { name: true },
    });
    if (linked.length > 0) {
      return NextResponse.json(
        {
          error: `ลบไม่ได้ เพราะมีประเภททรัพย์สินใช้บัญชีนี้อยู่: ${linked.map((c) => c.name).join(", ")}`,
        },
        { status: 400 },
      );
    }

    await prisma.assetAccountType.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: "ลบสำเร็จ" }, { status: 200 });
  } catch (error: any) {
    if (error.code === "P2003") {
      return NextResponse.json({ error: "ลบไม่ได้ เพราะมีประเภททรัพย์สินใช้บัญชีนี้อยู่" }, { status: 400 });
    }
    console.error("DELETE AssetAccountType Error:", error);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
