// src/app/api/asset-accounts/membership/route.ts
// 🌟 [asset_redesign] แอด/ถอน user เข้าบริษัทในโมดูล Asset + โอนเจ้าของ — ADMIN เท่านั้น
//
// ⚠️ จุดที่ต้องระวัง: การเข้าถึงต้องผ่าน 2 ชั้น (module Assessment ของบริษัท + membership)
// ถ้าแอด member เข้าบริษัทที่ยังไม่ได้ติ๊ก Assessment user จะเห็นหน้าจอว่างแบบไม่รู้สาเหตุ
// endpoint นี้จึงติ๊ก module ให้อัตโนมัติ แล้วแจ้งกลับไปว่าได้เปิดให้ด้วย
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";
import { ASSET_MODULE_CODE } from "@/lib/assetScope";
import { ensureModulesSeeded } from "@/lib/companyModules";

// 🔵 POST: แอด user เข้าบริษัท (หรืออัปเดตสถานะเจ้าของ)
export async function POST(request: NextRequest) {
  try {
    const { denied } = await guard(request, ["ADMIN"]);
    if (denied) return denied;

    const body = await request.json();
    const userId = body.userId as string;
    const companyId = Number(body.companyId);
    const makeOwner = body.isOwner === true;

    if (!userId || !companyId) {
      return NextResponse.json(
        { error: "กรุณาระบุผู้ใช้และบริษัท" },
        { status: 400 },
      );
    }

    const [user, company] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.company.findUnique({ where: { id: companyId } }),
    ]);
    if (!user) return NextResponse.json({ error: "ไม่พบผู้ใช้นี้" }, { status: 404 });
    if (!company) return NextResponse.json({ error: "ไม่พบบริษัทนี้" }, { status: 404 });

    // เช็คว่าบริษัทเปิด module Assessment ไว้หรือยัง ถ้ายังให้เปิดให้เลย
    await ensureModulesSeeded();
    const assetModule = await prisma.module.findUnique({
      where: { code: ASSET_MODULE_CODE },
    });
    if (!assetModule) {
      return NextResponse.json({ error: "ไม่พบข้อมูลโมดูล Asset" }, { status: 500 });
    }

    const moduleLink = await prisma.companyModule.findFirst({
      where: { companyId, moduleId: assetModule.id },
    });
    let moduleJustEnabled = false;
    if (!moduleLink) {
      await prisma.companyModule.create({
        data: { companyId, moduleId: assetModule.id },
      });
      moduleJustEnabled = true;
    }

    // ถ้าตั้งเป็นเจ้าของ ต้องถอดเจ้าของเดิมออกก่อน (มีเจ้าของได้คนเดียวต่อบริษัท)
    if (makeOwner) {
      await prisma.assetCompanyMember.updateMany({
        where: { companyId, isOwner: true },
        data: { isOwner: false },
      });
    }

    await prisma.assetCompanyMember.upsert({
      where: { userId_companyId: { userId, companyId } },
      update: { isOwner: makeOwner },
      create: { userId, companyId, isOwner: makeOwner },
    });

    return NextResponse.json(
      {
        message: moduleJustEnabled
          ? `เพิ่มสิทธิ์เรียบร้อย และเปิดโมดูล Assessment ให้บริษัท "${company.companyName}" อัตโนมัติ`
          : "เพิ่มสิทธิ์เรียบร้อยแล้ว",
        moduleJustEnabled,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST AssetMembership Error:", error);
    return NextResponse.json({ error: "เพิ่มสิทธิ์ไม่สำเร็จ" }, { status: 500 });
  }
}

// 🔴 DELETE: ถอน user ออกจากบริษัท
export async function DELETE(request: NextRequest) {
  try {
    const { denied } = await guard(request, ["ADMIN"]);
    if (denied) return denied;

    const body = await request.json();
    const userId = body.userId as string;
    const companyId = Number(body.companyId);

    if (!userId || !companyId) {
      return NextResponse.json(
        { error: "กรุณาระบุผู้ใช้และบริษัท" },
        { status: 400 },
      );
    }

    await prisma.assetCompanyMember.deleteMany({ where: { userId, companyId } });

    return NextResponse.json({ message: "ถอนสิทธิ์เรียบร้อยแล้ว" }, { status: 200 });
  } catch (error) {
    console.error("DELETE AssetMembership Error:", error);
    return NextResponse.json({ error: "ถอนสิทธิ์ไม่สำเร็จ" }, { status: 500 });
  }
}
