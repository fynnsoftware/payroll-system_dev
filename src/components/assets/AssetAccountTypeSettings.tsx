'use client';

// src/components/assets/AssetAccountTypeSettings.tsx
// 🌟 [per_company] ประเภทบัญชี (ผังบัญชี) — รหัสบัญชี + ชื่อบัญชี แยกตามบริษัท
// ค่าตั้งต้นที่ระบบสร้างให้: 10000000 สินทรัพย์ / 11000000 สินทรัพย์หมุนเวียน
//
// ⚠️ component กลาง ใช้ทั้ง /admin/settings และ /asset/settings
import React, { useState, useEffect } from 'react';
import { BiPlus, BiTrash, BiCheck, BiX, BiPencil } from 'react-icons/bi';
import { useToast } from '@/components/Toast';

interface AccountType { id: number; code: string; name: string; }

// 🌟 [account_code] รหัสบัญชีต้องเป็นตัวเลขล้วน 8 หลักพอดี
const ACCOUNT_CODE_LENGTH = 8;

/** ตัดอักขระที่ไม่ใช่ตัวเลขทิ้งตั้งแต่ตอนพิมพ์ และจำกัดความยาว */
const sanitizeCode = (raw: string) =>
  raw.replace(/\D/g, '').slice(0, ACCOUNT_CODE_LENGTH);

/** ข้อความเตือนใต้ช่อง — คืน null ถ้าใช้ได้ (ยังไม่พิมพ์ก็ถือว่ายังไม่ต้องเตือน) */
const codeHint = (code: string): string | null => {
  if (code === '') return null;
  if (code.length !== ACCOUNT_CODE_LENGTH) {
    return `ต้องมี ${ACCOUNT_CODE_LENGTH} หลัก (ตอนนี้ ${code.length} หลัก)`;
  }
  return null;
};

export default function AssetAccountTypeSettings({
  companyId,
  canManage = true,
}: { companyId: number | null; canManage?: boolean }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<AccountType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');

  const fetchRows = async () => {
    if (!companyId) { setRows([]); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/asset-account-types?companyId=${companyId}`);
      if (res.ok) setRows(await res.json());
      else setRows([]);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // โหลดใหม่ทุกครั้งที่สลับบริษัท ไม่งั้นจะเห็นผังบัญชีของบริษัทก่อนหน้าค้างอยู่
  useEffect(() => { fetchRows(); setEditingId(null); /* eslint-disable-next-line */ }, [companyId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (newCode.length !== ACCOUNT_CODE_LENGTH) {
      showToast(`รหัสบัญชีต้องมี ${ACCOUNT_CODE_LENGTH} หลัก`, 'error');
      return;
    }
    try {
      const res = await fetch('/api/asset-account-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode.trim(), name: newName.trim(), companyId }),
      });
      if (res.ok) {
        showToast('เพิ่มประเภทบัญชีสำเร็จ', 'success');
        setNewCode(''); setNewName('');
        fetchRows();
      } else {
        showToast((await res.json()).error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const startEdit = (r: AccountType) => { setEditingId(r.id); setEditCode(r.code); setEditName(r.name); };

  const saveEdit = async (id: number) => {
    if (!editName.trim()) return;
    if (editCode.length !== ACCOUNT_CODE_LENGTH) {
      showToast(`รหัสบัญชีต้องมี ${ACCOUNT_CODE_LENGTH} หลัก`, 'error');
      return;
    }
    try {
      const res = await fetch(`/api/asset-account-types/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editCode.trim(), name: editName.trim() }),
      });
      if (res.ok) {
        showToast('อัปเดตสำเร็จ', 'success');
        setEditingId(null);
        fetchRows();
      } else {
        showToast((await res.json()).error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const handleDelete = async (r: AccountType) => {
    if (!confirm(`ลบประเภทบัญชี "${r.code} ${r.name}"?`)) return;
    try {
      const res = await fetch(`/api/asset-account-types/${r.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('ลบสำเร็จ', 'success');
        fetchRows();
      } else {
        showToast((await res.json()).error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const inputBase = 'rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-100';

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
      <form onSubmit={handleAdd} className="mb-6 flex flex-wrap gap-3">
        {/* inputMode numeric — รหัสบัญชีเป็นตัวเลขล้วน แต่ใช้ type="text" เพื่อไม่ให้ปุ่มลูกศรขึ้น/ลงโผล่มา */}
        <input
          type="text" inputMode="numeric" placeholder="รหัสบัญชี 8 หลัก"
          value={newCode} onChange={(e) => setNewCode(sanitizeCode(e.target.value))}
          disabled={!companyId} maxLength={ACCOUNT_CODE_LENGTH}
          className={`${inputBase} w-52 font-mono ${codeHint(newCode) ? 'border-amber-400 bg-amber-50' : ''}`}
        />
        <input
          type="text" placeholder="ชื่อบัญชี เช่น สินทรัพย์"
          value={newName} onChange={(e) => setNewName(e.target.value)}
          disabled={!companyId} className={`${inputBase} flex-1 min-w-[200px]`}
        />
        <button
          type="submit"
          disabled={!companyId || newCode.length !== ACCOUNT_CODE_LENGTH || !newName.trim()}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-50"
        ><BiPlus /> เพิ่ม</button>

        {/* บอกจำนวนหลักที่ยังขาด ตั้งแต่ตอนพิมพ์ ไม่ต้องรอกดบันทึกแล้วค่อยเด้ง error */}
        {codeHint(newCode) && (
          <p className="w-full text-xs font-semibold text-amber-700">รหัสบัญชี: {codeHint(newCode)}</p>
        )}
      </form>

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        ผังบัญชีเป็นของบริษัทนี้เท่านั้น การเพิ่ม/แก้ไข/ลบ ไม่กระทบบริษัทอื่น — รหัสบัญชีต้องเป็นตัวเลข 8 หลักพอดี และห้ามซ้ำภายในบริษัทเดียวกัน
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-slate-400 font-semibold animate-pulse">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-slate-400 font-semibold">
          {companyId ? 'ยังไม่มีประเภทบัญชี' : 'กรุณาเลือกบริษัทก่อน'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider w-48">รหัสบัญชี</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">ชื่อบัญชี</th>
                {canManage && <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right w-32">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    {editingId === r.id ? (
                      <input
                        type="text" inputMode="numeric" value={editCode}
                        onChange={(e) => setEditCode(sanitizeCode(e.target.value))}
                        autoFocus maxLength={ACCOUNT_CODE_LENGTH}
                        className={`w-full rounded-lg border px-3 py-1.5 font-mono text-sm font-semibold outline-none focus:border-blue-500 ${editCode.length === ACCOUNT_CODE_LENGTH ? 'border-blue-300' : 'border-amber-400 bg-amber-50'}`}
                      />
                    ) : (
                      <span className="font-mono font-bold text-slate-700">{r.code}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === r.id ? (
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-lg border border-blue-300 px-3 py-1.5 text-sm font-semibold outline-none focus:border-blue-500" />
                    ) : (
                      <span className="font-semibold text-slate-700">{r.name}</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {editingId === r.id ? (
                          <>
                            <button onClick={() => saveEdit(r.id)} className="p-2 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-600 hover:text-white transition"><BiCheck className="text-lg" /></button>
                            <button onClick={() => setEditingId(null)} className="p-2 text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-300 transition"><BiX className="text-lg" /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(r)} className="p-2 text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-500 hover:text-white transition"><BiPencil className="text-lg" /></button>
                            <button onClick={() => handleDelete(r)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition"><BiTrash className="text-lg" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
