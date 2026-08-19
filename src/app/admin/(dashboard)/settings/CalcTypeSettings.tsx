'use client';

// src/app/admin/(dashboard)/settings/CalcTypeSettings.tsx
// 🌟 [Phase 2 - Asset] จัดการ "ประเภทการคำนวณค่าเสื่อมราคา" แบบเต็ม — แก้ได้ทั้งชื่อ เงื่อนไข และสูตรคำนวณ
// (เลือกจาก vocab คงที่ของ engine เท่านั้น ไม่รับสูตรอิสระ เพื่อความถูกต้องของตัวเลขทางบัญชี)
import React, { useState, useEffect } from 'react';
import { BiPlus, BiTrash, BiCheck, BiX, BiPencil, BiInfoCircle, BiLock } from 'react-icons/bi';
import { useToast } from '@/components/Toast';

interface Option { key: string; hint: string; }
interface CalcType {
  id: number;
  code: string;
  label: string;
  conditionType: string;
  conditionDescription: string;
  formulaType: string;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
}

const emptyNew = { code: '', label: '', conditionType: '', conditionDescription: '', formulaType: '', sortOrder: 50 };

export default function CalcTypeSettings() {
  const { showToast } = useToast();
  const [types, setTypes] = useState<CalcType[]>([]);
  const [conditionOptions, setConditionOptions] = useState<Option[]>([]);
  const [formulaOptions, setFormulaOptions] = useState<Option[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<CalcType>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRule, setNewRule] = useState(emptyNew);

  const fetchTypes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/depreciation-calc-types');
      if (res.ok) {
        const data = await res.json();
        setTypes(data.types);
        setConditionOptions(data.conditionOptions);
        setFormulaOptions(data.formulaOptions);
      }
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchTypes(); }, []);

  const startEdit = (t: CalcType) => {
    setEditingId(t.id);
    setEditForm({ ...t });
  };

  const saveEdit = async (id: number) => {
    try {
      const res = await fetch(`/api/depreciation-calc-types/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        showToast('อัปเดตสำเร็จ', 'success');
        setEditingId(null);
        fetchTypes();
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const handleDelete = async (t: CalcType) => {
    if (!confirm(`ลบประเภท "${t.label}"?`)) return;
    try {
      const res = await fetch(`/api/depreciation-calc-types/${t.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('ลบสำเร็จ', 'success');
        fetchTypes();
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.code || !newRule.label || !newRule.conditionType || !newRule.formulaType) {
      showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
      return;
    }
    try {
      const res = await fetch('/api/depreciation-calc-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });
      if (res.ok) {
        showToast('เพิ่มประเภทการคำนวณสำเร็จ', 'success');
        setNewRule(emptyNew);
        setShowAddForm(false);
        fetchTypes();
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const hintFor = (options: Option[], key?: string) => options.find(o => o.key === key)?.hint || '';

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
      <div className="mb-5 flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
        <BiInfoCircle className="text-lg shrink-0 mt-0.5" />
        <p>แก้ได้ทั้งชื่อ เงื่อนไข และสูตรคำนวณ — แต่ต้องเลือกจากตัวเลือกที่ระบบรองรับเท่านั้น (ไม่รับพิมพ์สูตรอิสระ เพื่อกันตัวเลขทางบัญชีผิดพลาด) แถวที่มีไอคอน <BiLock className="inline" /> คือ fallback เริ่มต้น แก้เงื่อนไข/ลบ/ปิดใช้งานไม่ได้</p>
      </div>

      <div className="divide-y divide-slate-100">
        {types.sort((a, b) => a.sortOrder - b.sortOrder).map((t) => (
          <div key={t.id} className="py-4">
            {editingId === t.id ? (
              <div className="space-y-3 bg-slate-50 rounded-xl p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">ชื่อที่แสดง</label>
                    <input type="text" value={editForm.label || ''} onChange={e => setEditForm({ ...editForm, label: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">ลำดับตรวจเงื่อนไข</label>
                    <input type="number" value={editForm.sortOrder ?? 0} onChange={e => setEditForm({ ...editForm, sortOrder: Number(e.target.value) })} disabled={t.isDefault} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 disabled:bg-slate-200" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">เงื่อนไข (Condition)</label>
                  <select value={editForm.conditionType || ''} onChange={e => setEditForm({ ...editForm, conditionType: e.target.value })} disabled={t.isDefault} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 disabled:bg-slate-200">
                    {conditionOptions.map(o => <option key={o.key} value={o.key}>{o.key}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-slate-400">{hintFor(conditionOptions, editForm.conditionType)}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">คำอธิบายเงื่อนไข (แสดงในรายงาน)</label>
                  <textarea rows={2} value={editForm.conditionDescription || ''} onChange={e => setEditForm({ ...editForm, conditionDescription: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">สูตรคำนวณ (Formula)</label>
                  <select value={editForm.formulaType || ''} onChange={e => setEditForm({ ...editForm, formulaType: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500">
                    {formulaOptions.map(o => <option key={o.key} value={o.key}>{o.key}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-slate-400">{hintFor(formulaOptions, editForm.formulaType)}</p>
                </div>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                  <input type="checkbox" checked={editForm.isActive ?? true} disabled={t.isDefault} onChange={e => setEditForm({ ...editForm, isActive: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                  เปิดใช้งาน
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded-lg bg-slate-200 hover:bg-slate-300 px-4 py-2 text-sm font-bold text-slate-600 transition"><BiX /> ยกเลิก</button>
                  <button onClick={() => saveEdit(t.id)} className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition"><BiCheck /> บันทึก</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-slate-700 flex items-center gap-1.5">
                    {t.isDefault && <BiLock className="text-slate-400" title="Default fallback" />}
                    {t.label}
                    {!t.isActive && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 font-bold uppercase">ปิดใช้งาน</span>}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.conditionDescription}</p>
                  <p className="text-[11px] text-slate-300 mt-0.5 font-mono">condition: {t.conditionType} · formula: {t.formulaType} · order: {t.sortOrder}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => startEdit(t)} className="p-2 text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-500 hover:text-white transition"><BiPencil className="text-lg" /></button>
                  {!t.isDefault && (
                    <button onClick={() => handleDelete(t)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition"><BiTrash className="text-lg" /></button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {isLoading && <div className="p-6 text-center text-slate-400 font-semibold animate-pulse">Loading...</div>}

      <div className="mt-5 pt-5 border-t border-slate-200">
        {!showAddForm ? (
          <button onClick={() => setShowAddForm(true)} className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-md transition"><BiPlus /> เพิ่มประเภทการคำนวณใหม่</button>
        ) : (
          <form onSubmit={handleAdd} className="space-y-3 bg-slate-50 rounded-xl p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Code (slug)</label>
                <input type="text" placeholder="เช่น EARLY_DISPOSAL" value={newRule.code} onChange={e => setNewRule({ ...newRule, code: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">ชื่อที่แสดง</label>
                <input type="text" value={newRule.label} onChange={e => setNewRule({ ...newRule, label: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">เงื่อนไข (Condition)</label>
              <select value={newRule.conditionType} onChange={e => setNewRule({ ...newRule, conditionType: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500">
                <option value="">-- เลือกเงื่อนไข --</option>
                {conditionOptions.filter(o => o.key !== 'ALWAYS').map(o => <option key={o.key} value={o.key}>{o.key} — {o.hint}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">คำอธิบายเงื่อนไข</label>
              <textarea rows={2} value={newRule.conditionDescription} onChange={e => setNewRule({ ...newRule, conditionDescription: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">สูตรคำนวณ (Formula)</label>
              <select value={newRule.formulaType} onChange={e => setNewRule({ ...newRule, formulaType: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500">
                <option value="">-- เลือกสูตร --</option>
                {formulaOptions.map(o => <option key={o.key} value={o.key}>{o.key} — {o.hint}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">ลำดับตรวจเงื่อนไข</label>
              <input type="number" value={newRule.sortOrder} onChange={e => setNewRule({ ...newRule, sortOrder: Number(e.target.value) })} className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500" />
              <p className="mt-1 text-xs text-slate-400">เลขน้อยตรวจก่อน (default fallback ใช้ 99 เสมอ)</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddForm(false)} className="rounded-lg bg-slate-200 hover:bg-slate-300 px-4 py-2 text-sm font-bold text-slate-600 transition">ยกเลิก</button>
              <button type="submit" className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition">บันทึก</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
