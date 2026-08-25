'use client';

// src/app/asset/(main)/settings/page.tsx
// 🌟 [asset_settings] หน้าตั้งค่าสำหรับผู้ใช้งานระบบทรัพย์สิน
//
// มีเฉพาะ 2 แท็บที่เกี่ยวข้องกับงานประจำวัน:
//   - ประเภททรัพย์สิน (เพิ่มได้ แต่แก้ชื่อ/ลบไม่ได้ เพราะเป็นข้อมูลกลางที่ทุกบริษัทใช้ร่วมกัน)
//   - แจ้งเตือนใกล้หมดอายุ
//
// ⚠️ ไม่รวมแท็บ "ประเภทการคำนวณค่าเสื่อมราคา" และ "สิทธิ์เข้าถึงตาม Role"
// สองส่วนนั้นกระทบตัวเลขทางบัญชีและสิทธิ์ของทั้งระบบ จึงสงวนไว้ให้ ADMIN จัดการที่ /admin/settings
import React, { useState } from 'react';
import { BiCog, BiPackage, BiBell } from 'react-icons/bi';
import { ToastProvider } from '@/components/Toast';
import AssetCategorySettings from '@/components/assets/AssetCategorySettings';
import AssetWarningSettings from '@/components/assets/AssetWarningSettings';

export default function AssetSettingsPage() {
  const [tab, setTab] = useState<'CATEGORY' | 'WARNING'>('CATEGORY');

  return (
    <ToastProvider>
      <div className="mx-auto max-w-4xl animate-in fade-in duration-500">
        <div className="mb-6 flex items-center gap-3 border-b border-slate-200 pb-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BiCog className="text-2xl" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-800">Settings</h2>
            <p className="text-sm text-slate-500">ตั้งค่าประเภททรัพย์สินและการแจ้งเตือน</p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setTab('CATEGORY')}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${tab === 'CATEGORY' ? 'bg-blue-600 text-white shadow-md' : 'border border-slate-200 bg-white text-slate-500'}`}
          >
            <BiPackage /> ประเภททรัพย์สิน
          </button>
          <button
            onClick={() => setTab('WARNING')}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${tab === 'WARNING' ? 'bg-blue-600 text-white shadow-md' : 'border border-slate-200 bg-white text-slate-500'}`}
          >
            <BiBell /> แจ้งเตือนใกล้หมดอายุ
          </button>
        </div>

        {tab === 'CATEGORY' && <AssetCategorySettings />}
        {tab === 'WARNING' && <AssetWarningSettings />}
      </div>
    </ToastProvider>
  );
}
