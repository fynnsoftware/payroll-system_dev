// src/lib/formatDate.ts
// ⚠️ [timezone] ย้ายไปรวมที่ src/lib/datetime.ts แล้ว เพื่อให้ทุกอย่างที่เป็นวันที่/เวลา
// ยึดเวลาไทย (GMT+7) จากที่เดียว ไฟล์นี้เหลือไว้เป็นทางผ่านเพื่อไม่ให้ import เดิมพัง
//
// โค้ดใหม่ควร import จาก "@/lib/datetime" โดยตรง
export { formatDate, formatDateTime, formatDateLong } from "@/lib/datetime";
