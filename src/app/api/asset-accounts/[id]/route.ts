// src/app/api/asset-accounts/[id]/route.ts
// 🌟 [asset_redesign] แก้ไข / เปิดปิด / ลบ บัญชีเข้าระบบ Asset — ADMIN เท่านั้น
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { guard } from "@/lib/apiGuard";

// 🟡 PUT: เปลี่ยนรหัสผ่าน / อีเมล / เปิด-ปิดการใช้งาน
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { denied } = await guard(request, ["ADMIN"]);
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing || existing.role !== "ASSET") {
      return NextResponse.json({ error: "ไม่พบบัญชีนี้" }, { status: 404 });
    }

    const data: any = {};
    if (body.email !== undefined) data.email = (body.email as string)?.trim() || null;
    if (body.isActive !== undefined) data.isActive = body.isActive === true;
    if (body.password && String(body.password).trim() !== "") {
      data.passwordHash = await bcrypt.hash(body.password, 10);
    }

    const updated = await prisma.user.update({ where: { id }, data });

    return NextResponse.json(
      {
        message: "อัปเดตบัญชีสำเร็จ",
        data: { id: updated.id, username: updated.username, isActive: updated.isActive },
      },
      { status: 200 },
    );
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "อีเมลนี้ถูกใช้งานแล้ว" }, { status: 400 });
    }
    console.error("PUT AssetAccount Error:", error);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}

// 🔴 DELETE: ลบบัญชีถาวร
// ⚠️ ข้อมูลบริษัท/ทรัพย์สินจะไม่ถูกลบตาม — AssetCompanyMember.userId ตั้งเป็น SetNull ไว้
// บริษัทที่คนนี้เป็นเจ้าของจะกลายเป็น "ไม่มีเจ้าของ" ให้ admin โอนให้คนใหม่ภายหลัง
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { denied } = await guard(request, ["ADMIN"]);
    if (denied) return denied;

    const { id } = await params;
    const existing = await prisma.user.findUnique({
      where: { id },
      include: { assetMemberships: { where: { isOwner: true } } },
    });

    if (!existing || existing.role !== "ASSET") {
      return NextResponse.json({ error: "ไม่พบบัญชีนี้" }, { status: 404 });
    }

    const ownedCount = existing.assetMemberships.length;
    await prisma.user.delete({ where: { id } });

    return NextResponse.json(
      {
        message:
          ownedCount > 0
            ? `ลบบัญชีเรียบร้อย — มี ${ownedCount} บริษัทที่ไม่มีเจ้าของแล้ว กรุณาโอนเจ้าของให้ผู้ใช้คนอื่น`
            : "ลบบัญชีเรียบร้อยแล้ว",
        orphanedCompanies: ownedCount,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("DELETE AssetAccount Error:", error);
    return NextResponse.json({ error: "ลบบัญชีไม่สำเร็จ" }, { status: 500 });
  }
}
