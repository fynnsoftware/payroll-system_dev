'use client';

// src/components/assets/AssetCategorySettings.tsx
// ⚠️ component กลาง ใช้ทั้ง /admin/settings และ /asset/settings
//
// 🌟 [per_company] ประเภททรัพย์สินแยกขาดตามบริษัทแล้ว ต้องรับ companyId เข้ามาเสมอ
// การแก้ชื่อ/ลบจึงกระทบเฉพาะบริษัทนั้น ไม่ไปโดนรายงานของบริษัทอื่นเหมือนเดิมอีก
// ส่วนการลบยังมีด่านกันอยู่ — ลบได้เฉพาะประเภทที่ไม่มีทรัพย์สินใช้งานอยู่เลย
import React, { useState, useEffect } from 'react';
import { BiPlus, BiTrash, BiCheck, BiX, BiPencil } from 'react-icons/bi';
import { useToast } from '@/components/Toast';

interface AccountTypeRef { id: number; code: string; name: string; }
interface Category {
  id: number;
  name: string;
  codePrefix: string | null;
  accountTypeId: number | null;
  accountType: AccountTypeRef | null;
}

export default function AssetCategorySettings({
  companyId,
  canManage = true,
}: { companyId: number | null; canManage?: boolean }) {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  // 🌟 [asset_code] prefix รหัสทรัพย์สินของประเภทนี้ เช่น C -> C001, C002
  const [newPrefix, setNewPrefix] = useState('');
  // 🌟 [account_link] ผังบัญชีที่ประเภทนี้ลงบัญชีอยู่ ('' = ยังไม่ผูก)
  const [newAccountId, setNewAccountId] = useState('');
  const [accountTypes, setAccountTypes] = useState<AccountTypeRef[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrefix, setEditingPrefix] = useState('');
  const [editingAccountId, setEditingAccountId] = useState('');

  const fetchCategories = async () => {
    if (!companyId) { setCategories([]); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/asset-categories?companyId=${companyId}`);
      if (res.ok) setCategories(await res.json());
      else setCategories([]);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 🌟 [account_link] ผังบัญชีที่เลือกได้ต้องเป็นของบริษัทเดียวกันเท่านั้น
  const fetchAccountTypes = async () => {
    if (!companyId) { setAccountTypes([]); return; }
    try {
      const res = await fetch(`/api/asset-account-types?companyId=${companyId}`);
      setAccountTypes(res.ok ? await res.json() : []);
    } catch { setAccountTypes([]); }
  };

  // โหลดใหม่ทุกครั้งที่สลับบริษัท ไม่งั้นจะเห็นรายการของบริษัทก่อนหน้าค้างอยู่
  useEffect(() => {
    fetchCategories();
    fetchAccountTypes();
    setEditingId(null);
    /* eslint-disable-next-line */
  }, [companyId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const res = await fetch('/api/asset-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), codePrefix: newPrefix.trim(), accountTypeId: newAccountId || null, companyId }),
      });
      if (res.ok) {
        showToast('เพิ่มประเภททรัพย์สินสำเร็จ', 'success');
        setNewName(''); setNewPrefix(''); setNewAccountId('');
        fetchCategories();
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const startEdit = (c: Category) => { setEditingId(c.id); setEditingName(c.name); setEditingPrefix(c.codePrefix || ''); setEditingAccountId(c.accountTypeId ? String(c.accountTypeId) : ''); };

  const saveEdit = async (id: number) => {
    if (!editingName.trim()) return;
    try {
      const res = await fetch(`/api/asset-categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim(), codePrefix: editingPrefix.trim(), accountTypeId: editingAccountId || null }),
      });
      if (res.ok) {
        showToast('อัปเดตสำเร็จ', 'success');
        setEditingId(null);
        fetchCategories();
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const handleDelete = async (c: Category) => {
    if (!confirm(`ลบประเภททรัพย์สิน "${c.name}"?\nจะลบไม่ได้ถ้ามีทรัพย์สินใช้ประเภทนี้อยู่`)) return;
    try {
      const res = await fetch(`/api/asset-categories/${c.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('ลบสำเร็จ', 'success');
        fetchCategories();
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
      <form onSubmit={handleAdd} className="mb-6 flex flex-wrap gap-3">
        {/* 🌟 [asset_code] prefix สั้นๆ วางไว้ซ้ายสุด ให้เห็นความสัมพันธ์กับรหัสทรัพย์สินทันที */}
        <input
          type="text"
          placeholder="รหัส เช่น A"
          value={newPrefix}
          onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
          disabled={!companyId}
          maxLength={10}
          className="w-32 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold uppercase outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-100"
        />
        <input
          type="text"
          placeholder="เพิ่มประเภททรัพย์สินใหม่..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={!companyId}
          className="flex-1 min-w-[200px] rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-100"
        />
        <select
          value={newAccountId}
          onChange={(e) => setNewAccountId(e.target.value)}
          disabled={!companyId}
          className="w-56 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-100"
        >
          <option value="">— ไม่ระบุบัญชี —</option>
          {accountTypes.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
        </select>
        <button type="submit" disabled={!companyId} className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-50"><BiPlus /> เพิ่ม</button>
      </form>

      {/* 🌟 [per_company] บอกให้ชัดว่าแก้แล้วกระทบแค่บริษัทนี้ */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        ประเภททรัพย์สินเป็นของบริษัทนี้เท่านั้น การเพิ่ม/แก้ไข/ลบ ไม่กระทบบริษัทอื่น
        ส่วนการลบทำได้เฉพาะประเภทที่ยังไม่มีทรัพย์สินใช้งานอยู่
        <br />
        <span className="font-bold text-slate-600">รหัสนำหน้า</span> ใช้เติมรหัสทรัพย์สินให้อัตโนมัติตอนสร้างรายการใหม่
        (เช่น ตั้ง <span className="font-mono font-bold">C</span> ให้ยานพาหนะ ระบบจะเสนอ <span className="font-mono font-bold">C001</span>, <span className="font-mono font-bold">C002</span> ต่อให้เอง)
        เว้นว่างได้ถ้าอยากพิมพ์รหัสเองทุกครั้ง
        <br />
        <span className="font-bold text-slate-600">ประเภทบัญชี</span> เลือกจากผังบัญชีของบริษัทนี้ (ตั้งค่าได้ที่แท็บ &quot;ประเภทบัญชี&quot;)
        — ผังบัญชีที่ถูกผูกไว้แล้วจะลบไม่ได้จนกว่าจะย้ายประเภททรัพย์สินออกก่อน
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-slate-400 font-semibold animate-pulse">Loading...</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-3">
              {editingId === c.id ? (
                <div className="mr-3 flex flex-1 gap-2">
                  <input
                    type="text"
                    value={editingPrefix}
                    onChange={(e) => setEditingPrefix(e.target.value.toUpperCase())}
                    maxLength={10}
                    placeholder="รหัส"
                    className="w-24 rounded-lg border border-blue-300 px-3 py-1.5 text-sm font-bold uppercase outline-none focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    className="flex-1 rounded-lg border border-blue-300 px-3 py-1.5 text-sm font-semibold outline-none focus:border-blue-500"
                  />
                  <select
                    value={editingAccountId}
                    onChange={(e) => setEditingAccountId(e.target.value)}
                    className="w-52 rounded-lg border border-blue-300 px-2 py-1.5 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="">— ไม่ระบุบัญชี —</option>
                    {accountTypes.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </select>
                </div>
              ) : (
                <span className="flex items-center gap-2.5">
                  {c.codePrefix ? (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600">{c.codePrefix}</span>
                  ) : (
                    <span className="rounded-md bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-300">—</span>
                  )}
                  <span className="font-semibold text-slate-700">{c.name}</span>
                  {c.accountType ? (
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                      <span className="font-mono">{c.accountType.code}</span> {c.accountType.name}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">ไม่ระบุบัญชี</span>
                  )}
                </span>
              )}
              {canManage && (
                <div className="flex items-center gap-2">
                  {editingId === c.id ? (
                    <>
                      <button onClick={() => saveEdit(c.id)} className="p-2 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-600 hover:text-white transition"><BiCheck className="text-lg" /></button>
                      <button onClick={() => setEditingId(null)} className="p-2 text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-300 transition"><BiX className="text-lg" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(c)} className="p-2 text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-500 hover:text-white transition"><BiPencil className="text-lg" /></button>
                      <button onClick={() => handleDelete(c)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition"><BiTrash className="text-lg" /></button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
