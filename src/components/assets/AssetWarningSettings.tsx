'use client';

// src/components/assets/AssetWarningSettings.tsx
// ⚠️ component กลาง ใช้ทั้ง /admin/settings และ /asset/settings
// 🌟 [phase2asset_#16] ตั้งค่าจำนวนวันล่วงหน้าสำหรับ "ใกล้หมดอายุ" (ยังไม่ใช้เตือนจริง ค่าเริ่มต้น 0 = ปิด)
import React, { useState, useEffect } from 'react';
import { BiSave, BiInfoCircle } from 'react-icons/bi';
import { useToast } from '@/components/Toast';

export default function AssetWarningSettings() {
  const { showToast } = useToast();
  const [days, setDays] = useState('0');
  // 🌟 [residual_option] true = คงมูลค่า 1 บาท | false = คิดตามสูตรตรง (NBV ติดลบได้)
  const [enforceResidual, setEnforceResidual] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/asset-settings');
      if (res.ok) {
        const data = await res.json();
        setDays(String(data.nearExpiryWarningDays ?? 0));
        setEnforceResidual(data.enforceResidualValue !== false);
      }
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/asset-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nearExpiryWarningDays: Number(days),
          enforceResidualValue: enforceResidual,
        }),
      });
      if (res.ok) {
        showToast('บันทึกการตั้งค่าสำเร็จ', 'success');
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 flex gap-3 text-sm text-blue-800">
        <BiInfoCircle className="text-xl shrink-0 mt-0.5" />
        <p>
          ตอนนี้ระบบยังไม่มีการแจ้งเตือน "ใกล้หมดอายุ" — ค่าเริ่มต้นคือ 0 วัน (ปิดการแจ้งเตือน) ช่องนี้เตรียมไว้สำหรับใช้งานในอนาคต ทรัพย์สินจะขึ้นสถานะ "หมดอายุ" อัตโนมัติเมื่อมูลค่าตามบัญชีเหลือ 1 บาท โดยไม่ต้องตั้งค่าใดๆ เพิ่ม
          <br />
          <span className="font-bold">หมายเหตุ:</span> ค่านี้เป็นการตั้งค่าระดับระบบ มีผลกับทุกบริษัท
        </p>
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-slate-400 font-semibold animate-pulse">Loading...</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="max-w-sm">
            <label className="mb-1.5 block text-sm font-bold text-slate-700">แจ้งเตือนล่วงหน้าก่อนหมดอายุ (วัน)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500"
            />
            <p className="mt-2 text-xs text-slate-400">0 = ไม่แจ้งเตือน (ค่าเริ่มต้น)</p>
          </div>

          {/* 🌟 [residual_option] เลือกวิธีปิดยอดค่าเสื่อมสะสม */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-bold text-slate-700">วิธีปิดยอดค่าเสื่อมสะสม</p>

            <label className={`mb-2 flex cursor-pointer gap-3 rounded-xl border p-3 transition ${enforceResidual ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <input type="radio" checked={enforceResidual} onChange={() => setEnforceResidual(true)} className="mt-1 h-4 w-4" />
              <div>
                <p className="text-sm font-bold text-slate-800">คงมูลค่า 1 บาท <span className="font-normal text-slate-400">(แนะนำ)</span></p>
                <p className="mt-0.5 text-xs text-slate-500">
                  ค่าเสื่อมสะสมยกไปไม่เกิน (ราคาทุน − 1) และมูลค่าตามบัญชีไม่ต่ำกว่า 1 บาท ตามธรรมเนียมบัญชีไทย
                </p>
              </div>
            </label>

            <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${!enforceResidual ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <input type="radio" checked={!enforceResidual} onChange={() => setEnforceResidual(false)} className="mt-1 h-4 w-4" />
              <div>
                <p className="text-sm font-bold text-slate-800">คิดตามสูตรตรง (มูลค่าติดลบได้)</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  ค่าเสื่อมสะสมยกไป = ยกมา + ค่าเสื่อมงวดนี้ · มูลค่าตามบัญชียกไป = ราคาทุน − ค่าเสื่อมสะสมยกไป
                </p>
                <p className="mt-1 text-xs font-semibold text-amber-700">
                  ให้ผลตรงกับไฟล์ Excel ต้นฉบับทุกกรณี รวมถึงกรณีที่มูลค่าออกมาติดลบ
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
            <button type="submit" disabled={isSaving} className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md transition ${isSaving ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
              <BiSave /> {isSaving ? 'Saving...' : 'บันทึกการตั้งค่า'}
            </button>
            <p className="text-xs text-slate-400">มีผลกับรายงานและหน้าทะเบียนทรัพย์สินทันทีหลังบันทึก</p>
          </div>
        </form>
      )}
    </div>
  );
}
