'use client';

// src/components/assets/AssetCategorySettings.tsx
// ⚠️ component กลาง ใช้ทั้ง /admin/settings และ /asset/settings
//
// ⚠️ ประเภททรัพย์สินเป็นข้อมูลกลางของทั้งระบบ ไม่ได้แยกตามบริษัท
// การแก้ชื่อจึงมีผลกับทุกบริษัทที่ใช้ประเภทนั้นอยู่ (รวมถึงรายงานย้อนหลัง)
// ส่วนการลบมีด่านกันอยู่แล้วที่ระดับฐานข้อมูล — ลบได้เฉพาะประเภทที่ไม่มีทรัพย์สินใช้งานอยู่เลย
import React, { useState, useEffect } from 'react';
import { BiPlus, BiTrash, BiCheck, BiX, BiPencil } from 'react-icons/bi';
import { useToast } from '@/components/Toast';

interface Category { id: number; name: string; }

export default function AssetCategorySettings({ canManage = true }: { canManage?: boolean }) {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/asset-categories');
      if (res.ok) setCategories(await res.json());
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const res = await fetch('/api/asset-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        showToast('เพิ่มประเภททรัพย์สินสำเร็จ', 'success');
        setNewName('');
        fetchCategories();
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const startEdit = (c: Category) => { setEditingId(c.id); setEditingName(c.name); };

  const saveEdit = async (id: number) => {
    if (!editingName.trim()) return;
    try {
      const res = await fetch(`/api/asset-categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
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
      <form onSubmit={handleAdd} className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="เพิ่มประเภททรัพย์สินใหม่..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold outline-none focus:ring-blue-50 focus:border-blue-500"
        />
        <button type="submit" className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-md transition"><BiPlus /> เพิ่ม</button>
      </form>

      {/* เตือนให้รู้ว่าเป็นข้อมูลกลาง ไม่ใช่ของบริษัทตัวเองคนเดียว */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        ประเภททรัพย์สินเป็นข้อมูลกลางที่ทุกบริษัทใช้ร่วมกัน การแก้ชื่อจะมีผลกับรายงานของทุกบริษัทที่ใช้ประเภทนั้น
        ส่วนการลบทำได้เฉพาะประเภทที่ยังไม่มีทรัพย์สินใช้งานอยู่
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-slate-400 font-semibold animate-pulse">Loading...</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-3">
              {editingId === c.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  autoFocus
                  className="flex-1 mr-3 rounded-lg border border-blue-300 px-3 py-1.5 text-sm font-semibold outline-none focus:border-blue-500"
                />
              ) : (
                <span className="font-semibold text-slate-700">{c.name}</span>
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
