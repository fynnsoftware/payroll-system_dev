// src/app/api/companies/[id]/route.ts
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js"; // 🌟 นำเข้า Supabase
import { getToken } from "next-auth/jwt";
import { parseModuleCodes, syncCompanyModules } from "@/lib/companyModules";

// สร้างตัวแทน (Client) สำหรับคุยกับ Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// 🟡 PUT: อัปเดตข้อมูล (Edit)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }, // 🌟 1. แก้ Type ให้เป็น Promise
) {
  try {
    const resolvedParams = await params; // 🌟 2. ต้อง await แกะกล่องมันออกมาก่อน
    const id = parseInt(resolvedParams.id); // 🌟 3. ถึงจะเอา .id ไปใช้ได้

    const formData = await request.formData();

    const companyCode = formData.get("companyCode") as string;
    const companyName = formData.get("companyName") as string;
    const parentIdRaw = formData.get("parentId") as string; // เปลี่ยนชื่อตัวแปรนิดหน่อยเพื่อไม่ให้สับสน
    const file = formData.get("logoFile") as File | null;

    // 🌟 [Phase 2 - Asset] field ใหม่ตาม requirement doc
    // (periodEndDate ถูกตัดออกแล้วตาม phase2asset_#15 — ค่าเสื่อมราคายึด 31 ธ.ค. เสมอทุกบริษัท)
    const address = (formData.get("address") as string) || null;
    const description = (formData.get("description") as string) || null;

    // 🌟 [module_company] module ที่บริษัทนี้เปิดใช้ (JSON array ของ code)
    const moduleCodes = parseModuleCodes(formData.get("moduleCodes") as string);

    const token = await getToken({ req: request }).catch(() => null);
    const preparedBy = (token?.name as string) || (token as any)?.username || "SYSTEM";

    // ==========================================
    // 🛡️ โซนจัดการ parentId (แก้ปัญหาการย้ายบริษัท)
    // ==========================================
    let parsedParentId = null;

    // เช็กว่ามีค่าส่งมา และไม่ใช่คำว่า null หรือ undefined หรือค่าว่าง
    if (
      parentIdRaw &&
      parentIdRaw !== "null" &&
      parentIdRaw !== "undefined" &&
      parentIdRaw.trim() !== ""
    ) {
      parsedParentId = Number(parentIdRaw);

      // ดักจับ: ห้ามเอาบริษัทตัวเองไปเป็นแม่ของตัวเองเด็ดขาด! (ป้องกัน Infinite Loop)
      if (parsedParentId === id) {
        return NextResponse.json(
          { error: "ไม่สามารถเลือกตัวเองเป็นบริษัทแม่ได้ครับ" },
          { status: 400 },
        );
      }
    }
    // ==========================================

    let newLogoUrl = undefined; // ถ้าไม่มีรูปใหม่ จะได้ไม่ต้องไปแตะช่อง logoUrl เดิม

    // 📁 ถ้ามีการแนบไฟล์โลโก้ "รูปใหม่" มาด้วย
    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // สร้างชื่อไฟล์
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const safeOriginalName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const newFilename = `${timestamp}_${safeOriginalName}`;

      // 🚀 ยิงไฟล์ขึ้น Supabase Storage (ถัง company-logos)
      const { data, error } = await supabase.storage
        .from("company-logos")
        .upload(newFilename, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        console.error("Supabase Upload Error:", error);
        return NextResponse.json(
          { error: "อัปโหลดรูปล้มเหลว" },
          { status: 500 },
        );
      }

      // 🔗 ขอ URL แบบ Public
      const { data: publicUrlData } = supabase.storage
        .from("company-logos")
        .getPublicUrl(newFilename);

      newLogoUrl = publicUrlData.publicUrl;
    }

    // อัปเดตลง Database
    const updatedCompany = await prisma.company.update({
      where: { id },
      data: {
        companyCode,
        companyName,
        ...(newLogoUrl && { logoUrl: newLogoUrl }), // 🌟 อัปเดตโลโก้เฉพาะตอนที่มีคนอัปโหลดรูปใหม่
        parentId: parsedParentId, // 🌟 ใช้ค่าที่ผ่านการกรองความปลอดภัยมาแล้ว
        address,
        description,
        preparedBy,
      },
    });

    await syncCompanyModules(id, moduleCodes);

    return NextResponse.json(
      { message: "อัปเดตสำเร็จ!", data: updatedCompany },
      { status: 200 },
    );
  } catch (error) {
    console.error("PUT Error:", error);
    return NextResponse.json(
      { error: "อัปเดตไม่สำเร็จ (รหัสอาจซ้ำ)" },
      { status: 500 },
    );
  }
}

// 🟠 PATCH: Terminate / Reactivate บริษัท (soft-deactivate ไม่ใช่ลบถาวร)
// 🌟 [Phase 2 - Asset task #17] ตอนนี้ยังไม่รับ reason/effective date เพราะรอ user confirm
// (บันทึกแค่ terminatedAt = เวลาที่กด) แก้เพิ่มได้ทีหลังโดยไม่กระทบ contract ของ endpoint นี้
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);
    const body = await request.json().catch(() => ({}));
    const isActive = body.isActive !== false; // ส่ง { isActive: false } มาเพื่อ terminate, true เพื่อ reactivate

    const updated = await prisma.company.update({
      where: { id },
      data: {
        isActive,
        terminatedAt: isActive ? null : new Date(),
      },
    });

    return NextResponse.json(
      { message: isActive ? "เปิดใช้งานบริษัทอีกครั้งแล้ว" : "Terminate บริษัทเรียบร้อยแล้ว", data: updated },
      { status: 200 },
    );
  } catch (error) {
    console.error("PATCH (terminate) Error:", error);
    return NextResponse.json({ error: "ดำเนินการไม่สำเร็จ" }, { status: 500 });
  }
}

// 🔴 DELETE: ลบข้อมูลบริษัท + ข้อมูลที่เกี่ยวข้องทั้งหมดถาวร (bug_ลบ company ไม่ cascade)
// 🌟 [bug_ลบ company] ตัดสินใจตาม user confirm แล้ว:
//   1. ลบ User (login) ของพนักงานในบริษัทนี้ทิ้งไปด้วยเลย (ถาวร)
//   2. ถ้ายังมี Sub-company สังกัดอยู่ (parentId ชี้มาที่บริษัทนี้) ห้ามลบ Primary — ต้องลบ Sub ออกให้หมดก่อน
//   3. ต้อง confirm พิมพ์ชื่อบริษัทซ้ำ (ทำที่ฝั่ง UI) + server เช็คซ้ำอีกชั้นด้วย confirmName ที่ส่งมา
//   4. cascade ลบข้อมูลที่เกี่ยวเนื่องทั้งหมด: Payroll (+PayrollItem), Employee, User ที่ผูก, PayrollImportBatch
//      (+PayrollImportRecord), Asset (+AssetYearlyClose)
// ⚠️ ต้องใช้ ADMIN เท่านั้น เพราะเป็นการลบถาวรกู้คืนไม่ได้ + กระทบ login ของพนักงาน
export const maxDuration = 60;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);

    const token = await getToken({ req: request }).catch(() => null);
    if (!token || token.role !== "ADMIN") {
      return NextResponse.json(
        { error: "ต้องเป็น ADMIN เท่านั้นถึงจะลบบริษัทได้" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const confirmName = (body.confirmName as string) || "";

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json({ error: "ไม่พบบริษัทนี้" }, { status: 404 });
    }

    // 🛡️ กันการลบพลาด: ต้องพิมพ์ชื่อบริษัทให้ตรงเป๊ะมาด้วย
    if (confirmName.trim() !== company.companyName) {
      return NextResponse.json(
        { error: "กรุณายืนยันด้วยการพิมพ์ชื่อบริษัทให้ตรงกันก่อนลบ" },
        { status: 400 },
      );
    }

    // 🛡️ ห้ามลบถ้ายังมี Sub-company สังกัดอยู่ — ต้องลบ Sub ออกก่อนเสมอ (ทั้งกรณี Primary และ Sub ซ้อน Sub)
    const subCompanyCount = await prisma.company.count({ where: { parentId: id } });
    if (subCompanyCount > 0) {
      return NextResponse.json(
        { error: `ไม่สามารถลบได้ เนื่องจากยังมีบริษัทลูกสังกัดอยู่ ${subCompanyCount} บริษัท กรุณาลบบริษัทลูกออกให้หมดก่อน` },
        { status: 400 },
      );
    }

    await prisma.$transaction(
      async (tx) => {
        const employees = await tx.employee.findMany({
          where: { currentCompanyId: id },
          select: { id: true, userId: true },
        });
        const employeeIds = employees.map((e) => e.id);
        const userIds = employees.map((e) => e.userId).filter((uid): uid is string => !!uid);

        // Payroll (+PayrollItem cascade อัตโนมัติจาก schema)
        await tx.payroll.deleteMany({
          where: { OR: [{ companyId: id }, { employeeId: { in: employeeIds } }] },
        });

        // Employee ต้องลบก่อน User เสมอ เพราะ Employee.userId FK ไปหา User
        await tx.employee.deleteMany({ where: { currentCompanyId: id } });

        // ลบ login account (User) ของพนักงานที่ถูกลบไปด้วย
        if (userIds.length > 0) {
          await tx.user.deleteMany({ where: { id: { in: userIds } } });
        }

        // ประวัตินำเข้า Excel เงินเดือน (+PayrollImportRecord cascade อัตโนมัติจาก schema)
        await tx.payrollImportBatch.deleteMany({ where: { companyId: id } });

        // ทะเบียนทรัพย์สิน (+AssetYearlyClose cascade อัตโนมัติจาก schema)
        await tx.asset.deleteMany({ where: { companyId: id } });

        // สุดท้ายค่อยลบตัวบริษัท
        await tx.company.delete({ where: { id } });
      },
      { maxWait: 15000, timeout: 60000 },
    );

    return NextResponse.json({ message: "ลบบริษัทและข้อมูลที่เกี่ยวข้องทั้งหมดสำเร็จ!" }, { status: 200 });
  } catch (error: any) {
    console.error("DELETE Company Error:", error);
    if (error.code === "P2003") {
      return NextResponse.json(
        { error: "ไม่สามารถลบได้ เนื่องจากมีข้อมูลที่เกี่ยวข้องอยู่" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "ลบข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
