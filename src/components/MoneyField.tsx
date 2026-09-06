'use client';

// src/components/MoneyField.tsx
// 🌟 [money_ui] ช่องกรอกจำนวนเงินที่แสดงคั่นหลักพัน เช่น 1,229,000.00
//
// ⚠️ ทำไมต้องทำเอง: <input type="number"> แสดงคอมมาไม่ได้เลย
// สเปกบังคับให้ value เป็นตัวเลขล้วน ใส่คอมมาเข้าไปจะกลายเป็นค่าว่างทันที
// ราคาทรัพย์สินหลักล้านที่ไม่มีตัวคั่นอ่านยากมากและกรอกผิดหลักได้ง่าย (1229000 vs 12290000)
//
// ✅ วิธีที่เลือก: ใช้ input type="text" แล้วคุมรูปแบบเอง
//   - ตอนไม่ได้โฟกัส  -> แสดง 1,229,000.00 (อ่านง่าย)
//   - ตอนกำลังพิมพ์   -> แสดงตัวเลขดิบ ไม่ยัดคอมมาระหว่างพิมพ์
//     (ถ้าจัดรูปแบบสดๆ ตำแหน่งเคอร์เซอร์จะกระโดดทุกครั้งที่คอมมาถูกแทรก ซึ่งน่ารำคาญมาก)
//
// 🔑 ค่าที่รับ/ส่งออกเป็นสตริงตัวเลขล้วน เช่น "1229000" เหมือน input type="number" เดิม
// จึงเอาไปแทนที่ของเดิมได้โดยไม่ต้องแก้ตรรกะฟอร์มหรือ API
import React, { useState, useEffect } from 'react';

/** ปัดทศนิยม 2 ตำแหน่ง แล้วคั่นหลักพัน — "1229000" -> "1,229,000.00" */
function toDisplay(raw: string): string {
  if (raw === '' || raw === null || raw === undefined) return '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * แปลงสิ่งที่ผู้ใช้พิมพ์กลับเป็นตัวเลขล้วน — คืน null ถ้าอ่านไม่ออก
 * รับคอมมาที่ผู้ใช้พิมพ์เองหรือ paste มาจาก Excel ได้ด้วย
 */
function parseInput(text: string): string | null {
  const cleaned = text.replace(/,/g, '').replace(/\s/g, '').trim();
  if (cleaned === '') return '';
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * 100) / 100);
}

interface MoneyFieldProps {
  /** สตริงตัวเลขล้วน เช่น "1229000" (เหมือน input type="number") */
  value: string;
  onChange: (plainValue: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** ไม่ให้ติดลบ (ค่าเริ่มต้น: true — ราคาทรัพย์สินและค่าเสื่อมสะสมติดลบไม่ได้) */
  allowNegative?: boolean;
}

export default function MoneyField({
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  placeholder = '0.00',
  allowNegative = false,
}: MoneyFieldProps) {
  const [text, setText] = useState(() => toDisplay(value));
  const [focused, setFocused] = useState(false);

  // sync จากภายนอก (โหลดข้อมูลมาแก้ไข / ระบบเติมค่าให้)
  // ⚠️ ไม่ sync ระหว่างที่ผู้ใช้กำลังพิมพ์ ไม่งั้นตัวอักษรจะถูกจัดรูปแบบทับทุกครั้งที่กดปุ่ม
  useEffect(() => {
    if (!focused) setText(toDisplay(value));
  }, [value, focused]);

  const base =
    'w-full rounded-xl border border-slate-300 px-4 py-2.5 text-right text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500';

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      onFocus={(e) => {
        setFocused(true);
        // ถอดคอมมาออกให้แก้ไขง่าย แล้วเลือกทั้งหมดเพื่อพิมพ์ทับได้เลย
        setText(value ?? '');
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // กันตัวอักษรที่ไม่ใช่ตัวเลขตั้งแต่ตอนพิมพ์ แต่ยังยอมให้พิมพ์ "12." ค้างไว้ระหว่างทาง
        if (raw === '' || /^-?[\d,]*\.?\d*$/.test(raw)) setText(raw);
      }}
      onBlur={(e) => {
        setFocused(false);
        const parsed = parseInput(e.target.value);
        if (parsed === null) {
          setText(toDisplay(value)); // อ่านไม่ออก -> ถอยกลับค่าเดิม
          return;
        }
        const finalValue =
          !allowNegative && parsed !== '' && Number(parsed) < 0 ? '0' : parsed;
        onChange(finalValue);
        setText(toDisplay(finalValue));
      }}
      className={className || base}
    />
  );
}
