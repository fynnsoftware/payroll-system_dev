// src/app/api/companies/route.ts
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";
import { parseModuleCodes, syncCompanyModules } from "@/lib/companyModules";


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ==========================================
// 🟢 GET: ดึงข้อมูลบริษัท (จำกัดสิทธิ์ตามเครือบริษัท)
// ==========================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const primaryOnly = searchParams.get("primaryOnly");

    const token = await getToken({ req: request });
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userRole = token.role as string;
    const userCompanyId = token.companyId ? Number(token.companyId) : null;

    let allowedCompanyIds: number[] | null = null;

    // 🌟 ลอจิกจำกัดสิทธิ์ตามเครือบริษัทของ HR (ADMIN ไม่ถูกจำกัด เห็นทุกบริษัทเสมอ)
    // 🌟 [asset_redesign] role ASSET ไม่ผ่าน endpoint นี้แล้ว ย้ายไปใช้ /api/asset-companies
    if (userRole === "HR" && userCompanyId) {
      const ownCompany = await prisma.company.findUnique({
        where: { id: userCompanyId },
        select: { id: true, parentId: true },
      });

      if (ownCompany) {
        if (!ownCompany.parentId) {
          // 👑 อยู่ Primary -> เห็น Primary + Sub ทั้งหมด
          const subCompanies = await prisma.company.findMany({
            where: { parentId: ownCompany.id },
            select: { id: true },
          });
          allowedCompanyIds = [ownCompany.id, ...subCompanies.map((c) => c.id)];
        } else {
          // 🏢 อยู่ Sub -> เห็นเฉพาะ Sub ตัวเองอย่างเดียว!
          allowedCompanyIds = [ownCompany.id];
        }
      }

      if (!allowedCompanyIds || allowedCompanyIds.length === 0) {
        allowedCompanyIds = [-1]; // กันพลาด
      }
    }

    const whereCondition: any = {};
    if (primaryOnly === "true") whereCondition.parentId = null;
    if (allowedCompanyIds) whereCondition.id = { in: allowedCompanyIds };

    const companies = await prisma.company.findMany({
      where: whereCondition,
      include: {
        parent: true,
        subCompanies: true,
        // 🌟 [module_company] แนบ module ที่บริษัทเปิดใช้มาด้วย เพื่อให้ฟอร์มติ๊ก checkbox ได้ถูกต้อง
        moduleLinks: { include: { module: true } },
      },
      orderBy: { id: "asc" },
    });

    // แปลงให้ frontend ใช้ง่าย: moduleCodes = ["HR", "ASSET"]
    let result = companies.map((c) => ({
      ...c,
      moduleCodes: c.moduleLinks.map((link) => link.module.code),
    }));

    // 🌟 [module_company] กรองตาม module ที่บริษัทเปิดใช้
    //   role HR -> เห็นเฉพาะบริษัทที่เปิด module Payroll (HR)
    //   ADMIN   -> เห็นทั้งหมด ไม่กรอง (จะได้เข้าไปตั้งค่า module ให้บริษัทได้เสมอ)
    // ⚠️ sub-company ที่ยังไม่ได้ตั้ง module เอง จะยึดตาม module ของบริษัทแม่
    const requiredModule = userRole === "HR" ? "HR" : null;

    if (requiredModule) {
      // เตรียม map ของ module ระดับบริษัทแม่ไว้ใช้ fallback (บริษัทแม่อาจไม่ได้อยู่ในผลลัพธ์ที่ดึงมา)
      const parentIds = [
        ...new Set(result.map((c) => c.parentId).filter((id): id is number => !!id)),
      ];
      const parents = parentIds.length
        ? await prisma.company.findMany({
            where: { id: { in: parentIds } },
            select: {
              id: true,
              moduleLinks: { select: { module: { select: { code: true } } } },
            },
          })
        : [];
      const parentModules = new Map(
        parents.map((p) => [p.id, p.moduleLinks.map((l) => l.module.code)]),
      );

      result = result.filter((c) => {
        const codes =
          c.moduleCodes.length > 0
            ? c.moduleCodes
            : c.parentId
              ? parentModules.get(c.parentId) || []
              : [];
        return codes.includes(requiredModule);
      });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("GET Companies Error:", error);
    return NextResponse.json(
      { error: "ดึงข้อมูลบริษัทไม่สำเร็จ" },
      { status: 500 },
    );
  }
}

// ==========================================
// 🔵 POST: สร้างบริษัทใหม่
// ==========================================
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const companyCode = formData.get("companyCode") as string;
    const companyName = formData.get("companyName") as string;
    const parentId = formData.get("parentId") as string;
    const file = formData.get("logoFile") as File | null;

    // 🌟 [Phase 2 - Asset] field ใหม่ตาม requirement doc หน้าจอทะเบียนบริษัท
    // (periodEndDate ถูกตัดออกแล้วตาม phase2asset_#15 — ค่าเสื่อมราคายึด 31 ธ.ค. เสมอทุกบริษัท)
    const address = (formData.get("address") as string) || null;
    const description = (formData.get("description") as string) || null;

    // 🌟 [module_company] module ที่บริษัทนี้เปิดใช้ ส่งมาเป็น JSON array ของ code เช่น ["HR","ASSET"]
    const moduleCodes = parseModuleCodes(formData.get("moduleCodes") as string);

    // ผู้จัดทำ (Auto display) — ดึงจาก session ถ้ามี ไม่ block ถ้าไม่มี token (auth เต็มรูปแบบอยู่ใน task แยก)
    const token = await getToken({ req: request }).catch(() => null);
    const preparedBy = (token?.name as string) || (token as any)?.username || "SYSTEM";

    if (!companyCode || !companyName) {
      return NextResponse.json(
        { error: "กรุณากรอกข้อมูลให้ครบถ้วน" },
        { status: 400 },
      );
    }

    let logoUrl = null;

    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const safeOriginalName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const newFilename = `${timestamp}_${safeOriginalName}`;

      const { data, error } = await supabase.storage
        .from("company-logos")
        .upload(newFilename, buffer, { contentType: file.type, upsert: false });
      if (error)
        return NextResponse.json(
          { error: "อัปโหลดรูปล้มเหลว" },
          { status: 500 },
        );

      const { data: publicUrlData } = supabase.storage
        .from("company-logos")
        .getPublicUrl(newFilename);
      logoUrl = publicUrlData.publicUrl;
    }

    const newCompany = await prisma.company.create({
      data: {
        companyCode,
        companyName,
        logoUrl,
        parentId: parentId ? Number(parentId) : null,
        address,
        description,
        preparedBy,
      },
    });

    await syncCompanyModules(newCompany.id, moduleCodes);

    return NextResponse.json(
      { message: "สร้างบริษัทสำเร็จ!", data: newCompany },
      { status: 201 },
    );
  } catch (error: any) {
    if (error.code === "P2002")
      return NextResponse.json(
        { error: "รหัสบริษัทนี้มีอยู่ในระบบแล้ว" },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "บันทึกข้อมูลไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
