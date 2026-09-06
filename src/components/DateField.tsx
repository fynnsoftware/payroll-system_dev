'use client';

// src/components/DateField.tsx
// 🌟 [date_ui] ช่องกรอกวันที่ที่แสดงผลเป็น dd/Mmm/yyyy (เช่น 01/Feb/2026) ตรงกับทั้งระบบ
//
// ⚠️ ทำไมต้องทำเอง: <input type="date"> เรนเดอร์ช่องกรอกด้วยเอนจินของเบราว์เซอร์
// รูปแบบที่แสดงมาจาก locale ของเบราว์เซอร์ ไม่ใช่จากโค้ดเรา แก้ด้วย CSS/JS ไม่ได้
// และไม่มี locale ไหนให้ชื่อเดือนเป็นตัวอักษร — ทุกอันเป็นตัวเลขล้วน (dd/mm/yyyy, mm/dd/yyyy, ...)
//
// ✅ วิธีที่เลือก: ช่องข้อความที่เราคุมรูปแบบเองสำหรับ "แสดงผล + พิมพ์"
// แล้วซ่อน <input type="date"> จริงไว้ข้างหลังปุ่มปฏิทิน เพื่อยืม date picker ของ OS มาใช้
// ได้ทั้งรูปแบบที่ต้องการ และ picker ที่คนคุ้นเคยอยู่แล้ว (สำคัญมากบนมือถือ)
//
// 🔑 ค่าที่รับ/ส่งออกยังเป็น "yyyy-mm-dd" เหมือน input type="date" เดิมทุกประการ
// จึงเอาไปแทนที่ของเดิมได้โดยไม่ต้องแก้ตรรกะฟอร์มหรือ API เลย
import React, { useState, useEffect, useRef } from 'react';
import { BiCalendar } from 'react-icons/bi';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-02-01" -> "01/Feb/2026" (คืนค่าว่างถ้าอ่านไม่ออก) */
function isoToDisplay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const month = Number(m[2]);
  if (month < 1 || month > 12) return '';
  return `${m[3]}/${MONTHS[month - 1]}/${m[1]}`;
}

/**
 * แปลงสิ่งที่ผู้ใช้พิมพ์กลับเป็น "yyyy-mm-dd" — คืน null ถ้ายังไม่สมบูรณ์
 *
 * รับได้หลายแบบเพื่อไม่ให้ผู้ใช้ต้องพิมพ์เป๊ะ:
 *   01/Feb/2026 · 1/feb/2026 · 01-02-2026 · 01/02/2026 · 2026-02-01
 * ตัวคั่นใช้ / - . หรือเว้นวรรคก็ได้
 */
function parseDisplay(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  // รูปแบบ ISO ตรงๆ (เผื่อ paste มาจากที่อื่น)
  const iso = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const y = Number(iso[1]), mo = Number(iso[2]), d = Number(iso[3]);
    return isValid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }

  const parts = t.split(/[/\-. ]+/).filter(Boolean);
  if (parts.length !== 3) return null;

  const day = Number(parts[0]);
  const year = Number(parts[2]);
  if (!Number.isInteger(day) || !Number.isInteger(year)) return null;

  // เดือนรับได้ทั้งตัวเลข (2) และตัวอักษร (feb / FEB / February)
  let month: number;
  if (/^\d+$/.test(parts[1])) {
    month = Number(parts[1]);
  } else {
    const idx = MONTHS.findIndex((m) => parts[1].toLowerCase().startsWith(m.toLowerCase()));
    if (idx === -1) return null;
    month = idx + 1;
  }

  return isValid(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
}

/** เช็คว่าเป็นวันที่ที่มีอยู่จริง — กัน 31/Feb/2026 ที่ Date จะเลื่อนเป็น 3 มี.ค. ให้เงียบๆ */
function isValid(y: number, mo: number, d: number): boolean {
  if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

interface DateFieldProps {
  /** yyyy-mm-dd (เหมือน input type="date") */
  value: string;
  onChange: (isoValue: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
}

export default function DateField({
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  placeholder = 'dd/Mmm/yyyy',
  id,
}: DateFieldProps) {
  // ข้อความที่ผู้ใช้เห็น/พิมพ์ แยกจาก value จริง เพื่อให้พิมพ์กลางคันได้โดยไม่โดนเขียนทับ
  const [text, setText] = useState(() => isoToDisplay(value));
  const [focused, setFocused] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  // sync จากภายนอก (เช่น โหลดข้อมูลมาแก้ไข หรือระบบเติมค่าให้)
  // ⚠️ ไม่ sync ระหว่างที่ผู้ใช้กำลังพิมพ์อยู่ ไม่งั้นตัวอักษรจะถูกจัดรูปแบบทับทุกครั้งที่กดปุ่ม
  useEffect(() => {
    if (!focused) setText(isoToDisplay(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    const iso = parseDisplay(raw);
    if (iso) {
      onChange(iso);
      setText(isoToDisplay(iso)); // จัดรูปแบบให้สวยหลังพิมพ์เสร็จ เช่น 1/2/2026 -> 01/Feb/2026
    } else if (raw.trim() === '') {
      onChange('');
      setText('');
    } else {
      // พิมพ์ไม่ครบ/ไม่ถูกต้อง -> ถอยกลับไปค่าล่าสุดที่ใช้ได้ ไม่ปล่อยข้อความค้างที่อ่านไม่ออก
      setText(isoToDisplay(value));
    }
  };

  const openPicker = () => {
    if (disabled) return;
    const el = pickerRef.current;
    if (!el) return;
    // showPicker() เปิดปฏิทินได้โดยไม่ต้องโฟกัสช่อง — เบราว์เซอร์เก่าไม่มีให้ fallback เป็น click
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
  };

  const base =
    'w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-10 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500';

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        // required ผูกกับช่องข้อความเพื่อให้ validation ของฟอร์มยังทำงาน
        required={required}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => { setFocused(false); commit(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(text); }
          if (e.key === 'Escape') setText(isoToDisplay(value));
        }}
        className={className || base}
      />

      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        tabIndex={-1}
        title="เลือกจากปฏิทิน"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <BiCalendar className="text-lg" />
      </button>

      {/* input จริงที่ยืม date picker ของ OS มาใช้ — ซ่อนไว้แต่ยังต้องอยู่ใน layout
          (display:none จะทำให้ showPicker() ใช้ไม่ได้บางเบราว์เซอร์) */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 right-3 h-0 w-0 opacity-0"
      />
    </div>
  );
}
