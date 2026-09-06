// src/app/api/asset-companies/route.ts
// 🌟 [asset_redesign] ทะเบียนบริษัทฝั่งโมดูล Asset
//
// แยกจาก /api/companies ของฝั่ง payroll โดยเจตนา แม้จะใช้ตาราง Company เดียวกัน:
//   - endpoint นี้คืนเฉพาะบริษัทที่ user เข้าถึงได้ในบริบท asset (membership + module Assessment)
//   - asset user สร้างบริษัทเองได้ ระบบจะติ๊ก module Assessment + ใส่ตัวเองเป็นเจ้าของให้อัตโนมัติ
//     โดยไม่ไปยุ่งกับ module Payroll เลย
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";
import { getAssetCompanyIds, isAssetCompanyAllowed, ASSET_MODULE_CODE } from "@/lib/assetScope";
import { ensureModulesSeeded } from "@/lib/companyModules";
import { ensureCompanyAssetMasterData } from "@/lib/assetMasterData";

/**
 * 🌟 ตรวจความถูกต้องของบริษัทแม่ที่เลือก — คืนข้อความ error ถ้าไม่ผ่าน, null ถ้าผ่าน
 * กฎ: ต้องเป็นบริษัทที่ตัวเองเข้าถึงได้ / ต้องไม่ใช่ตัวเอง / ต้องเป็นบริษัทแม่ (ลึกได้แค่ 2 ชั้น)
 */
export async function validateParent(
  parentId: number | null,
  allowedIds: number[] | null,
  selfId?: number,
): Promise<string | null> {
  if (parentId === null) return null;

  if (selfId && parentId === selfId) {
    return "ไม่สามารถเลือกตัวเองเป็นบริษัทแม่ได้";
  }
  if (!isAssetCompanyAllowed(allowedIds, parentId)) {
    return "ไม่มีสิทธิ์เลือกบริษัทนี้เป็นบริษัทแม่";
  }

  const parent = await prisma.company.findUnique({
    where: { id: parentId },
    select: { parentId: true },
  });
  if (!parent) return "ไม่พบบริษัทแม่ที่เลือก";
  if (parent.parentId) {
    return "บริษัทลูกไม่สามารถเป็นบริษัทแม่ได้ (รองรับโครงสร้าง 2 ชั้นเท่านั้น)";
  }
  return null;
}

// ==========================================
// 🟢 GET: รายการบริษัทที่ใช้งานได้ในโมดูล Asset
// ==========================================
export async function GET(request: NextRequest) {
  try {
    const { denied, token } = await guard(request, ["ADMIN", "ASSET"]);
    if (denied) return denied;

    const allowedIds = await getAssetCompanyIds(token);

    // ADMIN (allowedIds === null) เห็นทุกบริษัทที่เปิด module Assessment ไว้
    // role อื่นเห็นเฉพาะบริษัทที่ตัวเองเป็นสมาชิก (กรอง module ไปแล้วใน getAssetCompanyIds)
    const where =
      allowedIds === null
        ? { moduleLinks: { some: { module: { code: ASSET_MODULE_CODE } } } }
        : { id: { in: allowedIds.length > 0 ? allowedIds : [-1] } };

    const companies = await prisma.company.findMany({
      where,
      include: {
        assetMembers: { include: { user: { select: { id: true, username: true } } } },
      },
      orderBy: { companyName: "asc" },
    });

    const result = companies.map((c) => ({
      id: c.id,
      companyCode: c.companyCode,
      companyName: c.companyName,
      logoUrl: c.logoUrl,
      address: c.address,
      description: c.description,
      origin: c.origin,
      isActive: c.isActive,
      parentId: c.parentId,
      members: c.assetMembers.map((m) => ({
        userId: m.userId,
        username: m.user?.username ?? null,
        isOwner: m.isOwner,
      })),
    }));

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("GET AssetCompanies Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลบริษัทไม่สำเร็จ" }, { status: 500 });
  }
}

// ==========================================
// 🔵 POST: asset user สร้างบริษัทของตัวเอง
// ==========================================
export async function POST(request: NextRequest) {
  try {
    const { denied, token } = await guard(request, ["ADMIN", "ASSET"]);
    if (denied) return denied;

    const body = await request.json();
    const companyCode = (body.companyCode as string)?.trim();
    const companyName = (body.companyName as string)?.trim();
    const address = (body.address as string)?.trim() || null;
    const description = (body.description as string)?.trim() || null;
    const parentId = body.parentId ? Number(body.parentId) : null;

    if (!companyCode || !companyName) {
      return NextResponse.json(
        { error: "กรุณากรอกชื่อบริษัทและเลขทะเบียนบริษัทให้ครบถ้วน" },
        { status: 400 },
      );
    }

    // 🌟 เลือกบริษัทแม่ได้เฉพาะบริษัทที่ตัวเองเข้าถึงได้ และลึกได้ 2 ชั้น
    const allowedIds = await getAssetCompanyIds(token);
    const parentError = await validateParent(parentId, allowedIds);
    if (parentError) {
      return NextResponse.json({ error: parentError }, { status: 400 });
    }

    // การันตีว่ามีแถว master ของ Module ก่อน ไม่งั้นติ๊ก Assessment ให้ไม่ได้
    await ensureModulesSeeded();
    const assetModule = await prisma.module.findUnique({
      where: { code: ASSET_MODULE_CODE },
    });
    if (!assetModule) {
      return NextResponse.json({ error: "ไม่พบข้อมูลโมดูล Asset" }, { status: 500 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          companyCode,
          companyName,
          address,
          description,
          parentId, // null = บริษัทแม่ (Primary), มีค่า = บริษัทลูก (Sub-company)
          origin: "ASSET", // สร้างจากฝั่ง asset ไม่เกี่ยวกับ payroll
          preparedBy: (token.name as string) || (token as any).username || "SYSTEM",
        },
      });

      // เปิด module Assessment ให้อัตโนมัติ (ไม่ติ๊ก Payroll)
      await tx.companyModule.create({
        data: { companyId: company.id, moduleId: assetModule.id },
      });

      // ใส่คนสร้างเป็นสมาชิกและเจ้าของ
      await tx.assetCompanyMember.create({
        data: { companyId: company.id, userId: token.id as string, isOwner: true },
      });

      return company;
    });

    // 🌟 [per_company] สร้างประเภททรัพย์สิน + ผังบัญชีตั้งต้นให้ทันที
    // เพื่อให้กดเพิ่มทรัพย์สินได้เลยโดยไม่ต้องไปตั้งค่าก่อน
    // (นอกจากนี้ยังมี lazy seed ตอน GET อีกชั้น เผื่อบริษัทเก่าที่สร้างก่อนฟีเจอร์นี้)
    await ensureCompanyAssetMasterData(created.id);

    return NextResponse.json(
      { message: "สร้างบริษัทสำเร็จ!", data: created },
      { status: 201 },
    );
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "เลขทะเบียนบริษัทนี้มีอยู่ในระบบแล้ว กรุณาใช้เลขอื่น" },
        { status: 400 },
      );
    }
    console.error("POST AssetCompany Error:", error);
    return NextResponse.json({ error: "สร้างบริษัทไม่สำเร็จ" }, { status: 500 });
  }
}
