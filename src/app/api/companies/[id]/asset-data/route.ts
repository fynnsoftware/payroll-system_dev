// src/app/api/companies/[id]/asset-data/route.ts
// 🌟 [asset_redesign #61] ปิดบริการ Asset ของบริษัท + ล้างข้อมูลทรัพย์สินทั้งหมด — ADMIN เท่านั้น
//
// ต่างจากเคส "ลบ user เจ้าของ" ที่ตกลงกันว่าข้อมูลต้องค้างไว้ (ดู AssetCompanyMember.userId = SetNull)
// endpoint นี้ใช้กับเคส "บริษัทเลิกกิจการจริง" ซึ่งต้องล้างให้หมด
//
// ⚠️ ไม่ลบตัว Company ทิ้ง เพราะบริษัทฝั่ง payroll มีพนักงาน/เงินเดือนผูกอยู่
// ถ้าต้องการลบทั้งบริษัท ให้ใช้ DELETE /api/companies/[id] (ฝั่ง payroll)
// หรือ DELETE /api/asset-companies/[id] (เฉพาะบริษัทที่ origin = 'ASSET')
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";
import { ASSET_MODULE_CODE } from "@/lib/assetScope";

export const maxDuration = 60;

// 🟢 GET: สรุปว่าจะมีอะไรถูกลบบ้าง (ให้ UI แสดงก่อนยืนยัน)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { denied } = await guard(request, ["ADMIN"]);
    if (denied) return denied;

    const { id: rawId } = await params;
    const companyId = Number(rawId);

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: "ไม่พบบริษัทนี้" }, { status: 404 });
    }

    const [assetCount, closeCount, memberCount] = await Promise.all([
      prisma.asset.count({ where: { companyId } }),
      prisma.assetYearlyClose.count({ where: { asset: { companyId } } }),
      prisma.assetCompanyMember.count({ where: { companyId } }),
    ]);

    return NextResponse.json(
      {
        companyName: company.companyName,
        origin: company.origin,
        assetCount,
        closeCount,
        memberCount,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET asset-data summary Error:", error);
    return NextResponse.json({ error: "ดึงข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}

// 🔴 DELETE: ล้างข้อมูล asset ของบริษัทนี้ทั้งหมด + ปิด module Assessment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { denied } = await guard(request, ["ADMIN"]);
    if (denied) return denied;

    const { id: rawId } = await params;
    const companyId = Number(rawId);

    const body = await request.json().catch(() => ({}));
    const confirmName = (body.confirmName as string) || "";

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: "ไม่พบบริษัทนี้" }, { status: 404 });
    }

    // 🛡️ ต้องพิมพ์ชื่อบริษัทยืนยัน เพราะกู้คืนไม่ได้
    if (confirmName.trim() !== company.companyName) {
      return NextResponse.json(
        { error: "กรุณายืนยันด้วยการพิมพ์ชื่อบริษัทให้ตรงกันก่อนดำเนินการ" },
        { status: 400 },
      );
    }

    const assetModule = await prisma.module.findUnique({
      where: { code: ASSET_MODULE_CODE },
    });

    const result = await prisma.$transaction(
      async (tx) => {
        // AssetYearlyClose ถูกลบตาม cascade ตอนลบ Asset
        const deletedAssets = await tx.asset.deleteMany({ where: { companyId } });
        const deletedMembers = await tx.assetCompanyMember.deleteMany({ where: { companyId } });

        // ปิดบริการ (ถอด module Assessment) เพื่อไม่ให้ยังเข้าถึงได้อยู่
        if (assetModule) {
          await tx.companyModule.deleteMany({
            where: { companyId, moduleId: assetModule.id },
          });
        }

        return { assets: deletedAssets.count, members: deletedMembers.count };
      },
      { maxWait: 15000, timeout: 60000 },
    );

    return NextResponse.json(
      {
        message: `ล้างข้อมูลทรัพย์สินของ "${company.companyName}" เรียบร้อยแล้ว (ลบทรัพย์สิน ${result.assets} รายการ, ถอนสิทธิ์ ${result.members} คน) และปิดโมดูล Assessment ให้แล้ว`,
        ...result,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("DELETE asset-data Error:", error);
    return NextResponse.json({ error: "ล้างข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
