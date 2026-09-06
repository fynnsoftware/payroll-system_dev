'use client';

// src/app/admin/(dashboard)/settings/page.tsx
// 🌟 [Phase 2 - Asset] หน้า Settings — จัดการ master data: ประเภททรัพย์สิน / ประเภทการคำนวณค่าเสื่อมราคา / สิทธิ์ Role-Module
import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { BiCog, BiPackage, BiCalculator, BiLockAlt, BiBell, BiSpreadsheet } from 'react-icons/bi';
import { ToastProvider } from '@/components/Toast';
import CalcTypeSettings from './CalcTypeSettings';
import RoleModuleAccessSettings from './RoleModuleAccessSettings';
// 🌟 component กลาง ใช้ร่วมกับหน้า Settings ในโซน /asset
import AssetCompanyPicker from '@/components/assets/AssetCompanyPicker';
import AssetCategorySettings from '@/components/assets/AssetCategorySettings';
import AssetAccountTypeSettings from '@/components/assets/AssetAccountTypeSettings';
import AssetWarningSettings from '@/components/assets/AssetWarningSettings';

export default function SettingsPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role || 'USER';
  const [tab, setTab] = useState<'CATEGORY' | 'ACCOUNT' | 'CALC_TYPE' | 'WARNING' | 'ACCESS'>('CATEGORY');
  // 🌟 [per_company] ประเภททรัพย์สิน/ประเภทบัญชี/วันแจ้งเตือน แยกตามบริษัทแล้ว
  const [companyId, setCompanyId] = useState<number | null>(null);
  const needsCompany = tab === 'CATEGORY' || tab === 'ACCOUNT' || tab === 'WARNING';

  return (
    <ToastProvider>
      <div className="p-6 md:p-8 max-w-4xl mx-auto animate-in fade-in duration-500 bg-slate-50 min-h-screen">
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-800 p-8 text-white shadow-lg">
          <h2 className="text-3xl font-black flex items-center tracking-tight">
            <BiCog className="mr-3 text-4xl text-blue-300" /> Settings
          </h2>
          <p className="mt-2 text-blue-100 font-medium">จัดการ master data ของโมดูลทะเบียนทรัพย์สิน</p>
        </div>

        {/* ตัวเลือกบริษัทขึ้นเฉพาะแท็บที่ข้อมูลแยกตามบริษัท
            แท็บ CALC_TYPE กับ ACCESS เป็นค่ากลางทั้งระบบ ถ้าโชว์ตัวเลือกไว้จะทำให้เข้าใจผิดว่าแก้แค่บริษัทเดียว */}
        {needsCompany && <AssetCompanyPicker value={companyId} onChange={setCompanyId} />}

        {/* sub menu แบบ tab ภายในหน้าเดียว (sidebar หลักยังคงเป็น list เดิม ไม่ทำ nested menu เพื่อความเรียบง่าย) */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setTab('CATEGORY')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'CATEGORY' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>
            <BiPackage /> ประเภททรัพย์สิน
          </button>
          <button onClick={() => setTab('ACCOUNT')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'ACCOUNT' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>
            <BiSpreadsheet /> ประเภทบัญชี
          </button>
          <button onClick={() => setTab('CALC_TYPE')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'CALC_TYPE' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>
            <BiCalculator /> ประเภทการคำนวณค่าเสื่อมราคา
          </button>
          {userRole === 'ADMIN' && (
            <button onClick={() => setTab('WARNING')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'WARNING' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>
              <BiBell /> แจ้งเตือนใกล้หมดอายุ
            </button>
          )}
          {userRole === 'ADMIN' && (
            <button onClick={() => setTab('ACCESS')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'ACCESS' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>
              <BiLockAlt /> สิทธิ์เข้าถึงตาม Role
            </button>
          )}
        </div>

        {tab === 'CATEGORY' && <AssetCategorySettings companyId={companyId} />}
        {tab === 'ACCOUNT' && <AssetAccountTypeSettings companyId={companyId} />}
        {tab === 'CALC_TYPE' && <CalcTypeSettings />}
        {tab === 'WARNING' && userRole === 'ADMIN' && <AssetWarningSettings companyId={companyId} />}
        {tab === 'ACCESS' && userRole === 'ADMIN' && <RoleModuleAccessSettings />}
      </div>
    </ToastProvider>
  );
}
