// src/lib/assetReportExport.ts
// 🌟 [asset_report] ส่งออกรายงานทรัพย์สินเป็นไฟล์ Excel แยกตามแท็บ
//
// ⚠️ ตัวเลขที่ export ต้องเป็น "ตัวเลขจริง" ไม่ใช่สตริงที่จัดรูปแบบแล้ว
// ถ้าส่งเป็น "1,234.00" Excel จะมองเป็นข้อความ นำไป sum/pivot ต่อไม่ได้
// จึงใส่ number ดิบแล้วกำหนด number format ที่ระดับ cell แทน
import * as XLSX from "xlsx";
import { formatDate } from "@/lib/datetime";
import { formatRateWithYears } from "@/lib/depreciation";

export interface ExportDetailRow {
  assetCode: string;
  category: string;
  // 🌟 [account_col] ผังบัญชีของประเภททรัพย์สินชิ้นนี้ (null = ยังไม่ได้ผูกบัญชี)
  accountCode: string | null;
  accountName: string | null;
  description: string;
  location: string | null;
  companyName: string;
  depreciationRate: number;
  purchaseDate: string;
  endOfLifeDate: string;
  totalUsefulLifeDays: number;
  daysUsedTotal: number;
  calcType: string;
  calcCondition: string;
  cost: number;
  accumDeprBF: number;
  depreciationCurrentPeriod: number;
  accumDeprCF: number;
  nbv: number;
  isExpired: boolean;
}

export interface ExportTotals {
  cost: number;
  accumDeprBF: number;
  depreciationCurrentPeriod: number;
  accumDeprCF: number;
  nbv: number;
}

export interface ExportReport {
  companyName: string;
  periodStartDate: string;
  periodEndDate: string;
  summary: { category: string; items: ExportDetailRow[]; subtotal: ExportTotals }[];
  // 🌟 [account_group] แท็บสรุปจัดกลุ่ม 2 ชั้น: ประเภทบัญชี > ประเภททรัพย์สิน
  summaryByAccount: {
    accountCode: string | null;
    accountName: string | null;
    categories: { category: string; items: ExportDetailRow[]; subtotal: ExportTotals }[];
    accountTotal: ExportTotals;
  }[];
  detail: ExportDetailRow[];
  grandTotal: ExportTotals;
  /**
   * 🌟 [report_filter] คำอธิบายตัวกรองที่ใช้อยู่ เช่น "ประเภทบัญชี: 11000000 สินทรัพย์หมุนเวียน"
   *
   * ⚠️ จำเป็นต้องมี ไม่ใช่แค่ของประดับ — รายงานที่ถูกกรองแล้วยอด "รวมทั้งหมด"
   * ไม่ใช่ยอดทั้งบริษัท ถ้าไฟล์ไม่บอกไว้ คนที่เปิดทีหลังจะเอาไปกระทบยอดผิด
   */
  filterNotes?: string[];
}

/** หัวรายงาน 3 บรรทัดที่ใส่ไว้บนสุดของทุก sheet */
function buildHeaderRows(report: ExportReport, sheetTitle: string): any[][] {
  const rows: any[][] = [
    [sheetTitle],
    [`บริษัท: ${report.companyName}`],
    [`ช่วงงวด: ${formatDate(report.periodStartDate)} - ${formatDate(report.periodEndDate)}`],
  ];
  if (report.filterNotes && report.filterNotes.length > 0) {
    rows.push([`ตัวกรอง: ${report.filterNotes.join(" | ")} (ยอดรวมด้านล่างเป็นยอดเฉพาะที่กรองแล้ว)`]);
  }
  rows.push([]); // เว้นบรรทัดก่อนเริ่มตาราง
  return rows;
}

/**
 * กำหนดความกว้างคอลัมน์แบบคร่าวๆ ตามความยาวเนื้อหาจริง
 * (ถ้าไม่ตั้ง Excel จะใช้ความกว้าง default ทำให้ข้อความไทยยาวๆ ถูกตัด)
 */
function autoWidth(rows: any[][]): { wch: number }[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      widths[i] = Math.max(widths[i] || 10, Math.min(len + 2, 45));
    });
  }
  return widths.map((wch) => ({ wch }));
}

/** ใส่ number format ให้คอลัมน์ตัวเลขทศนิยม 2 ตำแหน่งพร้อมคั่นหลักพัน */
function applyNumberFormat(
  sheet: XLSX.WorkSheet,
  numericColIndexes: number[],
  startRow: number,
  endRow: number,
) {
  for (let r = startRow; r <= endRow; r++) {
    for (const c of numericColIndexes) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (cell && typeof cell.v === "number") cell.z = "#,##0.00";
    }
  }
}

// ==========================================
// Sheet 1: สรุปทะเบียนทรัพย์สิน (group by ประเภท)
// ==========================================
export function buildSummarySheet(report: ExportReport): XLSX.WorkSheet {
  const rows: any[][] = buildHeaderRows(report, "สรุปทะเบียนทรัพย์สิน");

  // หัวตาราง 2 ชั้นแบบ pivot: แถบ "Values" คร่อมคอลัมน์ตัวเลขทั้ง 5 (คอลัมน์ E-I)
  rows.push(["", "", "", "", "Values", "", "", "", ""]);
  const valuesBandRow = rows.length - 1;

  rows.push([
    "ประเภททรัพย์สิน",
    "รหัสทรัพย์สิน",
    "รายละเอียดทรัพย์สิน",
    "อัตราค่าเสื่อมราคาต่อปี",
    "ราคาทุน",
    "ค่าเสื่อมสะสมยกมา",
    "ค่าเสื่อมราคา",
    "ค่าเสื่อมสะสมยกไป",
    "มูลค่าตามบัญชียกไป",
  ]);

  const headerRowIndex = rows.length - 1;

  // 🌟 [account_group] วนตามบัญชีก่อน แล้วค่อยแยกประเภททรัพย์สินในแต่ละบัญชี
  const accountHeaderRows: number[] = []; // เก็บไว้ merge แถบหัวบัญชีให้คร่อมทั้งแถว
  for (const acc of report.summaryByAccount) {
    const accLabel = acc.accountCode
      ? `${acc.accountName} (${acc.accountCode})`
      : "ไม่ระบุบัญชี";

    rows.push([`ประเภทบัญชี: ${accLabel}`, "", "", "", "", "", "", "", ""]);
    accountHeaderRows.push(rows.length - 1);

    for (const group of acc.categories) {
      group.items.forEach((item, i) => {
        rows.push([
          i === 0 ? group.category : "", // ไม่พิมพ์ชื่อประเภทซ้ำทุกแถว เหมือน pivot
          item.assetCode,
          item.description,
          formatRateWithYears(item.depreciationRate, item.totalUsefulLifeDays),
          item.cost,
          item.accumDeprBF,
          item.depreciationCurrentPeriod,
          item.accumDeprCF,
          item.nbv,
        ]);
      });
      rows.push([
        `${group.category} Total`,
        "",
        "",
        "",
        group.subtotal.cost,
        group.subtotal.accumDeprBF,
        group.subtotal.depreciationCurrentPeriod,
        group.subtotal.accumDeprCF,
        group.subtotal.nbv,
      ]);
    }

    rows.push([
      `รวมบัญชี ${accLabel}`,
      "",
      "",
      "",
      acc.accountTotal.cost,
      acc.accountTotal.accumDeprBF,
      acc.accountTotal.depreciationCurrentPeriod,
      acc.accountTotal.accumDeprCF,
      acc.accountTotal.nbv,
    ]);
  }

  rows.push([
    "Grand Total",
    "",
    "",
    "",
    report.grandTotal.cost,
    report.grandTotal.accumDeprBF,
    report.grandTotal.depreciationCurrentPeriod,
    report.grandTotal.accumDeprCF,
    report.grandTotal.nbv,
  ]);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = autoWidth(rows);

  // merge ช่อง "Values" ให้คร่อมคอลัมน์ E-I (index 4-8) เหมือนหัว pivot จริง
  sheet["!merges"] = [
    ...(sheet["!merges"] || []),
    { s: { r: valuesBandRow, c: 4 }, e: { r: valuesBandRow, c: 8 } },
    // แถบหัวบัญชีคร่อมทั้งแถว (A-I) ไม่งั้นข้อความยาวจะถูกคอลัมน์ถัดไปบัง
    ...accountHeaderRows.map((r) => ({ s: { r, c: 0 }, e: { r, c: 8 } })),
  ];

  applyNumberFormat(sheet, [4, 5, 6, 7, 8], headerRowIndex + 1, rows.length - 1);
  return sheet;
}

// ==========================================
// Sheet 2: ข้อมูลทะเบียนทรัพย์สิน (รายละเอียด 14 คอลัมน์)
// ==========================================
export function buildDetailSheet(report: ExportReport): XLSX.WorkSheet {
  const rows: any[][] = buildHeaderRows(report, "ข้อมูลทะเบียนทรัพย์สิน");

  rows.push([
    "รหัสทรัพย์สิน",
    "ประเภททรัพย์สิน",
    "รหัสบัญชี",
    "ชื่อบัญชี",
    "รายละเอียดทรัพย์สิน",
    "ที่ตั้งทรัพย์สิน",
    "อัตราค่าเสื่อมราคาต่อปี",
    "วันที่ซื้อ",
    "วันที่สิ้นสุดอายุ",
    "อายุการใช้งานทั้งหมด (วัน)",
    "อายุการใช้งานที่ผ่านมา (วัน)",
    "ประเภทการคำนวณค่าเสื่อมราคา",
    "เงื่อนไข",
    "ราคาทุน",
    "ค่าเสื่อมสะสมยกมา",
    "ค่าเสื่อมราคา",
    "ค่าเสื่อมสะสมยกไป",
    "มูลค่าตามบัญชียกไป",
    "สถานะ",
  ]);

  const headerRowIndex = rows.length - 1;

  for (const row of report.detail) {
    rows.push([
      row.assetCode,
      row.category,
      // เก็บรหัสบัญชีเป็นข้อความ ไม่ใช่ตัวเลข ไม่งั้น Excel จะตัดศูนย์นำหน้าทิ้ง
      row.accountCode ?? "-",
      row.accountName ?? "-",
      row.description,
      row.location || "-",
      formatRateWithYears(row.depreciationRate, row.totalUsefulLifeDays),
      formatDate(row.purchaseDate),
      formatDate(row.endOfLifeDate),
      row.totalUsefulLifeDays,
      row.daysUsedTotal,
      row.calcType,
      row.calcCondition,
      row.cost,
      row.accumDeprBF,
      row.depreciationCurrentPeriod,
      row.accumDeprCF,
      row.nbv,
      row.isExpired ? "หมดอายุ" : "ปกติ",
    ]);
  }

  rows.push([
    "รวมทั้งหมด",
    `${report.detail.length} รายการ`,
    // เว้นว่างคอลัมน์ C-M (รหัสบัญชี ... เงื่อนไข) รวม 11 ช่อง ก่อนถึงคอลัมน์ตัวเลข
    "", "", "", "", "", "", "", "", "", "", "",
    report.grandTotal.cost,
    report.grandTotal.accumDeprBF,
    report.grandTotal.depreciationCurrentPeriod,
    report.grandTotal.accumDeprCF,
    report.grandTotal.nbv,
    "",
  ]);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = autoWidth(rows);
  // 🌟 [account_col] คอลัมน์ตัวเลขขยับไป 2 ช่องหลังแทรกรหัสบัญชี/ชื่อบัญชี (K-O -> M-Q)
  applyNumberFormat(sheet, [13, 14, 15, 16, 17], headerRowIndex + 1, rows.length - 1);
  return sheet;
}

/** ชื่อไฟล์: ตัดอักขระที่ Windows ห้ามใช้ในชื่อไฟล์ออก */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export type ExportTab = "SUMMARY" | "DETAIL" | "BOTH";

/**
 * ส่งออกไฟล์ Excel ตามแท็บที่เลือก
 * - SUMMARY / DETAIL = ไฟล์ที่มี sheet เดียว (ตามแท็บที่เปิดอยู่)
 * - BOTH = ไฟล์เดียวมี 2 sheet
 */
export function exportAssetReport(
  report: ExportReport,
  tab: ExportTab,
  year: number,
): string {
  const wb = XLSX.utils.book_new();

  if (tab === "SUMMARY" || tab === "BOTH") {
    XLSX.utils.book_append_sheet(wb, buildSummarySheet(report), "สรุปทะเบียนทรัพย์สิน");
  }
  if (tab === "DETAIL" || tab === "BOTH") {
    XLSX.utils.book_append_sheet(wb, buildDetailSheet(report), "ข้อมูลทะเบียนทรัพย์สิน");
  }

  const suffix = tab === "SUMMARY" ? "สรุป" : tab === "DETAIL" ? "รายละเอียด" : "ทั้งหมด";
  const fileName = safeFileName(`ทะเบียนทรัพย์สิน_${report.companyName}_${year}_${suffix}.xlsx`);

  XLSX.writeFile(wb, fileName);
  return fileName;
}
