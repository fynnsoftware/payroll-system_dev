'use client';

// src/components/MoneyField.tsx
// 🌟 [money_ui] ช่องกรอกจำนวนเงินที่ใส่คอมมาให้ "ทันทีที่พิมพ์" เช่น 1,229,000.00
//
// ⚠️ ทำไมต้องทำเอง: <input type="number"> แสดงคอมมาไม่ได้เลย
// สเปกบังคับให้ value เป็นตัวเลขล้วน ใส่คอมมาเข้าไปจะกลายเป็นค่าว่างทันที
// ราคาทรัพย์สินหลักล้านที่ไม่มีตัวคั่นอ่านยากและกรอกผิดหลักได้ง่าย (1229000 vs 12290000)
//
// ⚠️ โจทย์ยากของการจัดรูปแบบสดๆ คือ "ตำแหน่งเคอร์เซอร์"
// พอแทรกคอมมาเข้าไป ความยาวข้อความเปลี่ยน ถ้าไม่จัดการอะไรเลย เคอร์เซอร์จะเด้งไปท้ายช่อง
// ทุกครั้งที่พิมพ์ ทำให้แก้เลขกลางๆ ไม่ได้เลย
//
// ✅ วิธีแก้: นับจำนวน "ตัวเลข" ที่อยู่ก่อนเคอร์เซอร์ก่อนจัดรูปแบบ
// แล้วหลังจัดรูปแบบเสร็จ เดินหาตำแหน่งที่มีตัวเลขครบจำนวนเดิม แล้ววางเคอร์เซอร์ตรงนั้น
// คอมมาจึงถูกข้ามไปโดยอัตโนมัติ ไม่ว่าจะแทรกหรือหายไปกี่ตัว
//
// 🔑 ค่าที่รับ/ส่งออกเป็นสตริงตัวเลขล้วน เช่น "1229000" เหมือน input type="number" เดิม
import React, { useState, useEffect, useRef } from 'react';

const MAX_DECIMALS = 2;

/** ใส่คอมมาคั่นหลักพันให้ส่วนจำนวนเต็ม — ใช้ regex ไม่แปลงเป็น Number เพื่อไม่ให้เสียความละเอียดกับเลขยาวมาก */
const groupThousands = (intPart: string) =>
  intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * จัดรูปแบบระหว่างพิมพ์ — ยอมให้มีจุดค้างท้ายได้ (เช่น "12.") เพราะผู้ใช้กำลังจะพิมพ์ทศนิยมต่อ
 * ถ้าบังคับเติม .00 ทันทีจะพิมพ์ต่อไม่ได้
 */
function formatWhileTyping(raw: string): string {
  // เก็บเฉพาะตัวเลขกับจุด (คอมมาเดิมถูกทิ้งแล้วใส่ใหม่ทั้งหมด)
  let s = raw.replace(/[^\d.]/g, '');

  // เหลือจุดเดียว — จุดที่พิมพ์เกินมาให้ตัดทิ้ง
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }

  const [rawInt = '', rawDec] = s.split('.');
  // ตัดศูนย์นำหน้า แต่เก็บ "0" เดี่ยวๆ ไว้ (พิมพ์ 0.5 ต้องได้)
  const intPart = rawInt.replace(/^0+(?=\d)/, '');

  if (rawDec === undefined) return groupThousands(intPart);
  return `${groupThousands(intPart) || '0'}.${rawDec.slice(0, MAX_DECIMALS)}`;
}

/** ถอดคอมมาออกให้เหลือตัวเลขล้วนสำหรับส่งขึ้น server */
const toPlain = (display: string) => display.replace(/,/g, '');

/** เติมทศนิยมให้ครบ 2 ตำแหน่งตอนออกจากช่อง */
function formatOnBlur(display: string): string {
  const plain = toPlain(display);
  if (plain === '' || plain === '.') return '';
  const n = Number(plain);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: MAX_DECIMALS,
    maximumFractionDigits: MAX_DECIMALS,
  });
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
  const [text, setText] = useState(() => formatOnBlur(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // ตำแหน่งเคอร์เซอร์ที่ต้องกู้คืนหลัง React render เสร็จ (null = ไม่ต้องแตะ)
  const caretRef = useRef<number | null>(null);

  // sync จากภายนอก (โหลดข้อมูลมาแก้ไข / ระบบเติมค่าให้)
  // ⚠️ ไม่ sync ระหว่างที่ผู้ใช้กำลังพิมพ์ ไม่งั้นตัวอักษรจะถูกจัดรูปแบบทับทุกครั้งที่กดปุ่ม
  useEffect(() => {
    if (!focused) setText(formatOnBlur(value));
  }, [value, focused]);

  // วางเคอร์เซอร์กลับที่เดิมหลังจากข้อความถูกจัดรูปแบบใหม่
  // ต้องทำใน useLayoutEffect เพื่อให้เกิดก่อนเบราว์เซอร์วาดจอ ไม่งั้นจะเห็นเคอร์เซอร์กระพริบไปท้ายช่อง
  React.useLayoutEffect(() => {
    if (caretRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  }, [text]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;

    // นับ "ตัวเลขและจุด" ที่อยู่ก่อนเคอร์เซอร์ — คอมมาไม่นับ เพราะเป็นตัวที่ระบบใส่ให้เอง
    const countableBefore = raw.slice(0, caret).replace(/[^\d.]/g, '').length;

    const formatted = formatWhileTyping(raw);
    setText(formatted);

    // เดินหาตำแหน่งในข้อความใหม่ที่มีตัวเลขครบตามจำนวนเดิม
    let seen = 0;
    let pos = 0;
    while (pos < formatted.length && seen < countableBefore) {
      if (/[\d.]/.test(formatted[pos])) seen++;
      pos++;
    }
    caretRef.current = pos;

    // ส่งค่าขึ้นทันทีระหว่างพิมพ์ เพื่อให้ส่วนที่คำนวณสด (เช่น preview อายุการใช้งาน) ตามทัน
    onChange(toPlain(formatted));
  };

  const base =
    'w-full rounded-xl border border-slate-300 px-4 py-2.5 text-right text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500';

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      onFocus={(e) => {
        setFocused(true);
        // เลือกทั้งหมดให้พิมพ์ทับได้เลย — แก้ราคาส่วนใหญ่คือพิมพ์ใหม่ทั้งตัว ไม่ใช่แก้ทีละหลัก
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={handleChange}
      onBlur={() => {
        setFocused(false);
        const plain = toPlain(text);
        const n = Number(plain);
        const finalPlain =
          plain === '' || !Number.isFinite(n)
            ? ''
            : String(!allowNegative && n < 0 ? 0 : Math.round(n * 100) / 100);
        onChange(finalPlain);
        setText(formatOnBlur(finalPlain));
      }}
      className={className || base}
    />
  );
}
