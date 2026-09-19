// src/app/api/asset-companies/[id]/route.ts
// 🌟 [asset_redesign] แก้ไข/ลบบริษัทในโมดูล Asset
//
// ⚠️ กฎสำคัญ: ลบได้เฉพาะบริษัทที่ origin = 'ASSET' เท่านั้น
// บริษัทที่มาจากฝั่ง payroll (origin = 'PAYROLL') ห้ามลบจาก endpoint นี้เด็ดขาด
// เพราะมีพนักงาน/เงินเดือนผูกอยู่ — ถ้าจะเลิกใช้ ให้ถอด module Assessment ออกแทน
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";
import { getAssetCompanyIds, isAssetCompanyAllowed, explainAssetAccessDenied } from "@/lib/assetScope";
import { getGroupRootId, findCodeCollisionsOnMove, resyncAssetGroupRoots } from "@/lib/companyGroup";
import { validateParent } from "../route";

/** เช็คสิทธิ์กับบริษัทหนึ่ง — คืน response ถ้าไม่ผ่าน, null ถ้าผ่าน */
async function guardCompany(request: NextRequest, companyId: number) {
  const { denied, token } = await guard(request, ["ADMIN", "ASSET"]);
  if (denied) return { denied, token: null };

  const allowed = await getAssetCompanyIds(token);
  if (!isAssetCompanyAllowed(allowed, companyId)) {
    const reason = await explainAssetAccessDenied(token, companyId);
    return {
      denied: NextResponse.json({ error: reason }, { status: 403 }),
      token: null,
    };
  }
  return { denied: null, token };
}

// 🟡 PUT: แก้ไขข้อมูลบริษัท
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);

    const { denied, token } = await guardCompany(request, id);
    if (denied) return denied;

    const body = await request.json();
    const companyCode = (body.companyCode as string)?.trim();
    const companyName = (body.companyName as string)?.trim();

    if (!companyCode || !companyName) {
      return NextResponse.json(
        { error: "กรุณากรอกชื่อบริษัทและเลขทะเบียนบริษัทให้ครบถ้วน" },
        { status: 400 },
      );
    }

    const parentId = body.parentId ? Number(body.parentId) : null;

    // 🌟 เช็คบริษัทแม่ที่เลือก (สิทธิ์ / ไม่ใช่ตัวเอง / ลึกได้ 2 ชั้น)
    const allowedIds = await getAssetCompanyIds(token);
    const parentError = await validateParent(parentId, allowedIds, id);
    if (parentError) {
      return NextResponse.json({ error: parentError }, { status: 400 });
    }

    // 🛡️ ถ้าบริษัทนี้มีบริษัทลูกอยู่ จะย้ายไปเป็นลูกของใครไม่ได้ (จะกลายเป็น 3 ชั้น)
    if (parentId) {
      const childCount = await prisma.company.count({ where: { parentId: id } });
      if (childCount > 0) {
        return NextResponse.json(
          { error: `บริษัทนี้มีบริษัทลูกอยู่ ${childCount} บริษัท จึงย้ายไปเป็นบริษัทลูกของบริษัทอื่นไม่ได้` },
          { status: 400 },
        );
      }
    }

    // 🌟 [group_dup] ย้ายบริษัทเข้า/ออกจากเครือ = ทรัพย์สินทั้งหมดของบริษัทนี้ย้ายทะเบียนตาม
    //
    // รหัสทรัพย์สินห้ามซ้ำภายในเครือ ดังนั้นการย้ายเครืออาจทำให้รหัสที่เคยอยู่กันคนละเครือ
    // (ซึ่งถูกต้องตามกติกา) มาชนกันทันที ต้องเช็คก่อนบันทึก แล้วบอกให้ชัดว่ารหัสไหนชน
    // ถ้าปล่อยผ่าน DB จะเด้ง unique constraint ดิบๆ ผู้ใช้จะไม่รู้เลยว่าต้องไปแก้ตัวไหน
    //
    // หมายเหตุ: บริษัทที่มีลูกถูกบล็อกไม่ให้ย้ายไปแล้วข้างบน ชุดที่ย้ายจึงมีแค่บริษัทนี้ตัวเดียว
    const current = await prisma.company.findUnique({ where: { id }, select: { parentId: true } });
    const parentChanged = (current?.parentId ?? null) !== parentId;

    if (parentChanged) {
      const newGroupRootId = parentId ? await getGroupRootId(parentId) : id;
      const collisions = await findCodeCollisionsOnMove([id], newGroupRootId);
      if (collisions.length > 0) {
        const shown = collisions.slice(0, 5).join(", ");
        const more = collisions.length > 5 ? ` และอีก ${collisions.length - 5} รหัส` : "";
        return NextResponse.json(
          {
            error:
              `ย้ายเครือบริษัทไม่ได้ เพราะรหัสทรัพย์สินจะซ้ำกับบริษัทในเครือปลายทาง: ${shown}${more}` +
              " — รหัสทรัพย์สินแก้ไม่ได้ ต้องลบหรือย้ายทรัพย์สินที่ชนออกก่อน",
          },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.company.update({
      where: { id },
      data: {
        companyCode,
        companyName,
        address: (body.address as string)?.trim() || null,
        description: (body.description as string)?.trim() || null,
        parentId,
        preparedBy: (token.name as string) || (token as any).username || "SYSTEM",
      },
    });

    // 🌟 [group_dup] groupRootId เป็นค่า derived — ต้องซิงก์หลังบันทึกโครงสร้างใหม่แล้ว
    // ไม่งั้นทรัพย์สินจะยังถูกบังคับ unique ด้วยเครือเก่า
    if (parentChanged) {
      await resyncAssetGroupRoots([id]);
    }

    return NextResponse.json({ message: "อัปเดตสำเร็จ!", data: updated }, { status: 200 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "เลขทะเบียนบริษัทนี้มีอยู่ในระบบแล้ว กรุณาใช้เลขอื่น" },
        { status: 400 },
      );
    }
    console.error("PUT AssetCompany Error:", error);
    return NextResponse.json({ error: "อัปเดตไม่สำเร็จ" }, { status: 500 });
  }
}

// 🔴 DELETE: ลบบริษัทที่สร้างจากฝั่ง asset พร้อมทรัพย์สินทั้งหมด
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);

    const { denied } = await guardCompany(request, id);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const confirmName = (body.confirmName as string) || "";

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json({ error: "ไม่พบบริษัทนี้" }, { status: 404 });
    }

    // 🛡️ ห้ามลบบริษัทฝั่ง payroll จาก endpoint นี้ (มีพนักงาน/เงินเดือนผูกอยู่)
    if (company.origin !== "ASSET") {
      return NextResponse.json(
        {
          error:
            "บริษัทนี้ถูกสร้างจากระบบเงินเดือน ลบจากหน้านี้ไม่ได้ หากต้องการเลิกใช้ระบบทรัพย์สิน ให้ผู้ดูแลระบบปิดโมดูล Assessment แทน",
        },
        { status: 400 },
      );
    }

    // 🛡️ ห้ามลบบริษัทแม่ที่ยังมีบริษัทลูกสังกัดอยู่ (กฎเดียวกับฝั่ง payroll)
    const childCount = await prisma.company.count({ where: { parentId: id } });
    if (childCount > 0) {
      return NextResponse.json(
        { error: `ไม่สามารถลบได้ เนื่องจากยังมีบริษัทลูกสังกัดอยู่ ${childCount} บริษัท กรุณาลบบริษัทลูกออกให้หมดก่อน` },
        { status: 400 },
      );
    }

    // 🛡️ ต้องพิมพ์ชื่อบริษัทยืนยัน เพราะลบถาวรพร้อมทรัพย์สินทั้งหมด
    if (confirmName.trim() !== company.companyName) {
      return NextResponse.json(
        { error: "กรุณายืนยันด้วยการพิมพ์ชื่อบริษัทให้ตรงกันก่อนลบ" },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      // Asset -> AssetYearlyClose ถูกลบตาม cascade ที่ตั้งไว้ใน schema
      await tx.asset.deleteMany({ where: { companyId: id } });
      // CompanyModule / AssetCompanyMember ถูกลบตาม cascade ตอนลบ Company
      await tx.company.delete({ where: { id } });
    });

    return NextResponse.json(
      { message: "ลบบริษัทและทรัพย์สินทั้งหมดเรียบร้อยแล้ว" },
      { status: 200 },
    );
  } catch (error) {
    console.error("DELETE AssetCompany Error:", error);
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
