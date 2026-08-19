// src/app/api/payroll/publish/route.ts
// 🌟 [security/perf fix task #8] เดิมไฟล์นี้: (1) ไม่มี auth check เลย ทั้งที่เป็น endpoint ที่ publish
// เงินเดือนจริงลงระบบ (2) วน for...of สร้าง Payroll ทีละคนใน transaction เดียว ไม่ chunk เลย เสี่ยง
// timeout ถ้าบริษัทมีพนักงานเยอะ (3) ไม่มี maxDuration ตาม convention ของโปรเจกต์ (import/route.ts มีแล้ว)
// แก้ทั้ง 3 จุด โดยเปลี่ยนมาใช้ bulk insert + chunking แบบเดียวกับ payroll/import/route.ts
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getToken } from "next-auth/jwt";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userRole = token.role as string;
    if (!["ADMIN", "HR"].includes(userRole)) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์ Publish ข้อมูลเงินเดือน" }, { status: 403 });
    }

    const { batchId } = await request.json();

    if (!batchId) {
      return NextResponse.json(
        { error: "ไม่พบรหัสอ้างอิง Batch" },
        { status: 400 },
      );
    }

    // 1. ตรวจสอบ Batch ว่ามีอยู่จริงและสถานะพร้อม Publish
    const batch = await prisma.payrollImportBatch.findUnique({
      where: { id: batchId },
      include: {
        records: {
          where: { status: "READY" }, // ดึงเฉพาะคนที่พร้อมใช้งาน
        },
      },
    });

    if (!batch) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูล Batch นี้ในระบบ" },
        { status: 404 },
      );
    }

    if (batch.status === "COMPLETED") {
      return NextResponse.json(
        { error: "ข้อมูลรอบบิลนี้ถูก Publish ไปแล้วครับ" },
        { status: 400 },
      );
    }

    // 2. ใช้ Transaction เพื่อความปลอดภัย (กวาดลง Prod ทีเดียว) + ขยาย timeout ให้ทันกรณีข้อมูลเยอะ
    await prisma.$transaction(
      async (tx) => {
        // 🌟 เคลียร์ Payroll ของจริง (Production) ของเดือน/ปี และบริษัทนี้ทิ้งก่อน (ถ้ามี)
        // ป้องกันกรณี HR กดยกเลิก Publish แล้ว Publish ใหม่ จะได้ไม่เกิดสลิปเงินเดือนซ้ำซ้อน
        await tx.payroll.deleteMany({
          where: {
            month: batch.month,
            year: batch.year,
            companyId: batch.companyId,
          },
        });

        // ดึงรายชื่อรหัสพนักงานที่มีอยู่จริงในระบบ มาเช็กก่อน (กัน Error กรณีใส่รหัสมั่วใน Excel)
        const allEmployees = await tx.employee.findMany({ select: { id: true } });
        const validEmpIds = new Set(allEmployees.map((e) => e.id));

        // ==========================================
        // 🚀 [แก้ใหม่] เตรียมข้อมูลไว้ก่อน แล้วยิง bulk insert + chunking แทนการวนสร้างทีละคน
        // ==========================================
        const payrollDataToInsert: any[] = [];
        const itemsConfigMap = new Map<string, any[]>();

        for (const record of batch.records) {
          const empId = record.employeeId!;
          if (!validEmpIds.has(empId)) continue; // ถ้าไม่มีรหัสพนักงานคนนี้ในระบบ ให้ข้ามไป

          payrollDataToInsert.push({
            month: batch.month,
            year: batch.year,
            totalEarnings: record.totalEarnings,
            totalDeductions: record.totalDeduction,
            netSalary: record.payrollAmount,
            salary: record.salary,
            tax: record.tax,
            sso: record.socialSecurityFund,
            pvf: record.providentFund,
            employeeId: empId,
            companyId: batch.companyId,
          });

          const items: any[] = [];
          // --- หมวดรายรับ (Earnings) - กรองเฉพาะค่าที่มากกว่า 0 ---
          if (Number(record.salary) > 0) items.push({ itemType: "EARNING", category: "SALARY", amount: record.salary, description: "Base Salary" });
          if (Number(record.mobileAllowance) > 0) items.push({ itemType: "EARNING", category: "ALLOWANCE", amount: record.mobileAllowance, description: "Mobile Allowance" });
          if (Number(record.housingTravelingAllowance) > 0) items.push({ itemType: "EARNING", category: "ALLOWANCE", amount: record.housingTravelingAllowance, description: "Housing/Traveling Allowance" });
          if (Number(record.overtime) > 0) items.push({ itemType: "EARNING", category: "OVERTIME", amount: record.overtime, description: "Overtime (OT)" });
          if (Number(record.bonus) > 0) items.push({ itemType: "EARNING", category: "BONUS", amount: record.bonus, description: "Bonus" });
          if (Number(record.others) > 0) items.push({ itemType: "EARNING", category: "OTHER", amount: record.others, description: "Other Earnings" });
          if (Number(record.parkingAllowance) > 0) items.push({ itemType: "EARNING", category: "ALLOWANCE", amount: record.parkingAllowance, description: "Parking Allowance" });
          if (Number(record.perdiemOtherAdditional) > 0) items.push({ itemType: "EARNING", category: "ALLOWANCE", amount: record.perdiemOtherAdditional, description: "Perdiem/Additional" });
          // --- หมวดรายจ่าย (Deductions) - กรองเฉพาะค่าที่มากกว่า 0 ---
          if (Number(record.tax) > 0) items.push({ itemType: "DEDUCTION", category: "TAX", amount: record.tax, description: "Withholding Tax" });
          if (Number(record.socialSecurityFund) > 0) items.push({ itemType: "DEDUCTION", category: "SSO", amount: record.socialSecurityFund, description: "Social Security Fund" });
          if (Number(record.providentFund) > 0) items.push({ itemType: "DEDUCTION", category: "PVF", amount: record.providentFund, description: "Provident Fund" });
          if (Number(record.studentLoanFund) > 0) items.push({ itemType: "DEDUCTION", category: "LOAN", amount: record.studentLoanFund, description: "Student Loan (กยศ.)" });
          if (Number(record.parking) > 0) items.push({ itemType: "DEDUCTION", category: "OTHER", amount: record.parking, description: "Parking Deduction" });
          if (Number(record.otherDeduction) > 0) items.push({ itemType: "DEDUCTION", category: "OTHER", amount: record.otherDeduction, description: "Other Deductions" });

          itemsConfigMap.set(empId, items);
        }

        if (payrollDataToInsert.length > 0) {
          // 2.1 ยิงสร้าง Payroll แบบ bulk
          await tx.payroll.createMany({ data: payrollDataToInsert });

          // 2.2 ดึง ID สลิปที่เพิ่งสร้าง (เฉพาะของงวด/บริษัทนี้) เพื่อเอาไปผูกกับ PayrollItem
          const createdPayrolls = await tx.payroll.findMany({
            where: { month: batch.month, year: batch.year, companyId: batch.companyId },
            select: { id: true, employeeId: true },
          });

          const payrollItemsToInsert: any[] = [];
          for (const p of createdPayrolls) {
            const items = itemsConfigMap.get(p.employeeId) || [];
            for (const item of items) {
              payrollItemsToInsert.push({ ...item, payrollId: p.id });
            }
          }

          // 2.3 ยิงสร้างรายการย่อยแบบแบ่ง Chunk (กัน timeout ถ้าข้อมูลเยอะ ตาม convention ของโปรเจกต์)
          const chunkSize = 1000;
          for (let i = 0; i < payrollItemsToInsert.length; i += chunkSize) {
            const itemsChunk = payrollItemsToInsert.slice(i, i + chunkSize);
            await tx.payrollItem.createMany({ data: itemsChunk });
          }
        }

        // 3. อัปเดตสถานะ Batch กลับเป็น COMPLETED (แปลว่า Publish ลง Prod แล้ว)
        await tx.payrollImportBatch.update({
          where: { id: batchId },
          data: { status: "COMPLETED" },
        });

        // (Optional) เปลี่ยนสถานะหางบิลใน Staging เป็น PUBLISHED เพื่อความชัดเจน
        await tx.payrollImportRecord.updateMany({
          where: { batchId: batchId, status: "READY" },
          data: { status: "PUBLISHED" },
        });
      },
      {
        maxWait: 15000,
        timeout: 120000,
      },
    );

    return NextResponse.json(
      { message: "Publish ข้อมูลเข้าสู่ระบบเงินเดือนพนักงานสำเร็จแล้ว!" },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Publish Error:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการ Publish", details: error.message },
      { status: 500 },
    );
  }
}
