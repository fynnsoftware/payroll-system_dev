// src/lib/formatDate.ts
// 🌟 รูปแบบวันที่มาตรฐานของโมดูล Asset — dd/mm/yyyy ปี ค.ศ. เสมอ
//
// ⚠️ ห้ามใช้ toLocaleDateString('th-TH') ในโมดูลนี้ เพราะจะได้ปี พ.ศ. (เช่น 1/2/2563)
// และไม่เติมศูนย์นำหน้า ทำให้รูปแบบไม่สม่ำเสมอกับช่อง input type="date" ที่เป็น ค.ศ.
// ผู้ใช้กรอกวันที่ซื้อเป็น ค.ศ. แต่ผลลัพธ์แสดงเป็น พ.ศ. จะสับสนว่าคำนวณผิดหรือเปล่า

/** แปลงวันที่เป็น dd/mm/yyyy (ค.ศ.) — คืน "-" ถ้าไม่มีค่า/ค่าไม่ถูกต้อง */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "-";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  return `${dd}/${mm}/${yyyy}`;
}
