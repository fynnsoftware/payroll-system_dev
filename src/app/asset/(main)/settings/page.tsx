'use client';

// src/app/asset/(main)/settings/page.tsx
// 🌟 [asset_settings] หน้าตั้งค่าสำหรับผู้ใช้งานระบบทรัพย์สิน
//
// 3 แท็บที่เกี่ยวข้องกับงานประจำวัน:
//   - ประเภททรัพย์สิน  (แยกตามบริษัท เพิ่ม/แก้/ลบ ได้เต็มที่)
//   - ประเภทบัญชี      (ผังบัญชี รหัสบัญชี + ชื่อบัญชี แยกตามบริษัท)
//   - แจ้งเตือนใกล้หมดอายุ
//
// ⚠️ ไม่รวมแท็บ "ประเภทการคำนวณค่าเสื่อมราคา" และ "สิทธิ์เข้าถึงตาม Role"
// สองส่วนนั้นกระทบตัวเลขทางบัญชีและสิทธิ์ของทั้งระบบ จึงสงวนไว้ให้ ADMIN จัดการที่ /admin/settings
import React, { useState } from 'react';
import { BiCog, BiPackage, BiBell, BiSpreadsheet } from 'react-icons/bi';
import { ToastProvider } from '@/components/Toast';
import AssetCompanyPicker from '@/components/assets/AssetCompanyPicker';
import AssetCategorySettings from '@/components/assets/AssetCategorySettings';
import AssetAccountTypeSettings from '@/components/assets/AssetAccountTypeSettings';
import AssetWarningSettings from '@/components/assets/AssetWarningSettings';

type Tab = 'CATEGORY' | 'ACCOUNT' | 'WARNING';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'CATEGORY', label: 'ประเภททรัพย์สิน', icon: <BiPackage /> },
  { key: 'ACCOUNT', label: 'ประเภทบัญชี', icon: <BiSpreadsheet /> },
  { key: 'WARNING', label: 'แจ้งเตือนใกล้หมดอายุ', icon: <BiBell /> },
];

export default function AssetSettingsPage() {
  const [tab, setTab] = useState<Tab>('CATEGORY');
  // 🌟 [per_company] เก็บบริษัทที่เลือกไว้ที่หน้านี้ แล้วส่งลงไปทุกแท็บ
  // สลับแท็บแล้วยังอยู่บริษัทเดิม ไม่ต้องเลือกใหม่ทุกครั้ง
  const [companyId, setCompanyId] = useState<number | null>(null);

  return (
    <ToastProvider>
      <div className="mx-auto max-w-4xl animate-in fade-in duration-500">
        <div className="mb-6 flex items-center gap-3 border-b border-slate-200 pb-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BiCog className="text-2xl" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-800">Settings</h2>
            <p className="text-sm text-slate-500">ตั้งค่าประเภททรัพย์สิน ผังบัญชี และการแจ้งเตือน</p>
          </div>
        </div>

        <AssetCompanyPicker value={companyId} onChange={setCompanyId} />

        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${tab === t.key ? 'bg-blue-600 text-white shadow-md' : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'CATEGORY' && <AssetCategorySettings companyId={companyId} />}
        {tab === 'ACCOUNT' && <AssetAccountTypeSettings companyId={companyId} />}
        {tab === 'WARNING' && <AssetWarningSettings companyId={companyId} />}
      </div>
    </ToastProvider>
  );
}
