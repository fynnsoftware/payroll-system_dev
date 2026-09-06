'use client';

// src/components/assets/AssetCompanyPicker.tsx
// 🌟 [per_company] ตัวเลือกบริษัทสำหรับหน้า Settings ฝั่ง Asset
//
// master data (ประเภททรัพย์สิน / ประเภทบัญชี / วันแจ้งเตือน) แยกตามบริษัทแล้ว
// ทุกหน้าที่แก้ค่าพวกนี้จึงต้องบอกให้ชัดว่า "กำลังแก้ของบริษัทไหนอยู่"
// ไม่งั้นผู้ใช้ที่ดูแลหลายบริษัทจะเผลอแก้ผิดบริษัทโดยไม่รู้ตัว
import React, { useState, useEffect } from 'react';
import { BiBuilding } from 'react-icons/bi';

interface CompanyOption { id: number; companyName: string; companyCode: string; parentId?: number | null; }

export default function AssetCompanyPicker({
  value,
  onChange,
}: { value: number | null; onChange: (id: number | null) => void }) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/asset-companies')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CompanyOption[]) => {
        setCompanies(data);
        // เลือกบริษัทแรกให้อัตโนมัติ ผู้ใช้ส่วนใหญ่ดูแลบริษัทเดียวจะได้ไม่ต้องกดเลือกทุกครั้ง
        if (data.length > 0 && value === null) onChange(data[0].id);
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line
  }, []);

  // แสดงเป็นลำดับชั้น บริษัทแม่ตามด้วยบริษัทลูก (โครงสร้างเดียวกับหน้า Report)
  const options: React.ReactNode[] = [];
  const rendered = new Set<number>();
  for (const primary of companies.filter((c) => !c.parentId)) {
    rendered.add(primary.id);
    options.push(<option key={primary.id} value={primary.id} className="font-bold">🏢 {primary.companyName}</option>);
    for (const sub of companies.filter((c) => c.parentId === primary.id)) {
      rendered.add(sub.id);
      options.push(<option key={sub.id} value={sub.id}>&nbsp;&nbsp;&nbsp;&nbsp;↳ {sub.companyName}</option>);
    }
  }
  for (const orphan of companies.filter((c) => !rendered.has(c.id))) {
    options.push(<option key={orphan.id} value={orphan.id}>↳ {orphan.companyName}</option>);
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
        <BiBuilding className="text-sm" /> บริษัทที่กำลังตั้งค่า
      </label>
      {isLoading ? (
        <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
      ) : companies.length === 0 ? (
        <p className="py-2 text-sm font-semibold text-slate-400">ยังไม่มีบริษัทที่คุณเข้าถึงได้</p>
      ) : (
        <>
          <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-blue-50 focus:border-blue-500"
          >
            <option value="">-- เลือกบริษัท --</option>
            {options}
          </select>
          <p className="mt-2 text-xs text-slate-400">
            ประเภททรัพย์สิน ประเภทบัญชี และจำนวนวันแจ้งเตือน เป็นข้อมูลของแต่ละบริษัทแยกกัน
          </p>
        </>
      )}
    </div>
  );
}
