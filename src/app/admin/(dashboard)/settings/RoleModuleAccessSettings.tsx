'use client';

// src/app/admin/(dashboard)/settings/RoleModuleAccessSettings.tsx
// 🌟 [RBAC] Checkbox matrix ให้ ADMIN กำหนดว่า role ไหนเข้า module ไหนได้บ้าง
import React, { useState, useEffect } from 'react';
import { BiInfoCircle } from 'react-icons/bi';
import { useToast } from '@/components/Toast';

interface ModuleRow { id: number; code: string; name: string; sortOrder: number; }
interface AccessRow { role: string; moduleCode: string; }

const ASSIGNABLE_ROLES = ['HR', 'ASSET', 'USER']; // ADMIN ไม่ต้องแสดง เพราะเข้าได้ทุกโมดูลเสมอโดยไม่ผ่าน matrix

export default function RoleModuleAccessSettings() {
  const { showToast } = useToast();
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [accessMatrix, setAccessMatrix] = useState<AccessRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/modules');
      if (res.ok) {
        const data = await res.json();
        setModules(data.modules);
        setAccessMatrix(data.accessMatrix);
      }
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const hasAccess = (role: string, moduleCode: string) =>
    accessMatrix.some((a) => a.role === role && a.moduleCode === moduleCode);

  const toggle = async (role: string, moduleCode: string) => {
    const currentlyAllowed = hasAccess(role, moduleCode);
    // อัปเดต UI ก่อนแบบ optimistic
    setAccessMatrix((prev) =>
      currentlyAllowed
        ? prev.filter((a) => !(a.role === role && a.moduleCode === moduleCode))
        : [...prev, { role, moduleCode }],
    );
    try {
      const res = await fetch('/api/modules/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, moduleCode, allowed: !currentlyAllowed }),
      });
      if (!res.ok) {
        showToast('อัปเดตไม่สำเร็จ', 'error');
        fetchData(); // rollback ด้วยการโหลดใหม่
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
      fetchData();
    }
  };

  if (isLoading) {
    return <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-10 text-center text-slate-400 font-semibold animate-pulse">Loading...</div>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
      <div className="mb-5 flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
        <BiInfoCircle className="text-lg shrink-0 mt-0.5" />
        <p><span className="font-bold">ADMIN</span> เข้าถึงได้ทุกโมดูลเสมอ ไม่ต้องตั้งค่าที่นี่ ตารางนี้คุมสิทธิ์ของ role อื่นเท่านั้น</p>
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="py-3 font-black uppercase tracking-wider text-xs text-slate-500">Role</th>
            {modules.map((m) => (
              <th key={m.id} className="py-3 text-center font-black uppercase tracking-wider text-xs text-slate-500">{m.name}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ASSIGNABLE_ROLES.map((role) => (
            <tr key={role}>
              <td className="py-3 font-bold text-slate-700">{role}</td>
              {modules.map((m) => (
                <td key={m.id} className="py-3 text-center">
                  <input
                    type="checkbox"
                    checked={hasAccess(role, m.code)}
                    onChange={() => toggle(role, m.code)}
                    className="h-5 w-5 rounded border-slate-300 text-blue-600 cursor-pointer"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
