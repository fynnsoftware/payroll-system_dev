'use client';

// src/app/asset/(main)/company/page.tsx
// 🌟 [asset_redesign] ทะเบียนบริษัทฝั่งโมดูล Asset — asset user สร้าง/แก้ไขบริษัทของตัวเองได้
// แยกจากหน้า Company Management ฝั่ง admin โดยสิ้นเชิง ไม่มี checkbox module และไม่มี hierarchy
// เพราะบริษัทที่สร้างจากที่นี่เปิด module Assessment ให้อัตโนมัติอยู่แล้ว
import React, { useState, useEffect } from 'react';
import {
  BiBuilding, BiPlus, BiX, BiRefresh, BiCog, BiTrash, BiErrorCircle, BiCrown,
  BiSubdirectoryRight,
} from 'react-icons/bi';
import { ToastProvider, useToast } from '@/components/Toast';

interface Member {
  userId: string | null;
  username: string | null;
  isOwner: boolean;
}

interface AssetCompany {
  id: number;
  companyCode: string;
  companyName: string;
  address: string | null;
  description: string | null;
  origin: string;
  parentId: number | null;
  members: Member[];
}

const emptyForm = { companyCode: '', companyName: '', address: '', description: '', parentId: '' };

export default function AssetCompanyPage() {
  return (
    <ToastProvider>
      <AssetCompanyManagement />
    </ToastProvider>
  );
}

function AssetCompanyManagement() {
  const { showToast } = useToast();
  const [companies, setCompanies] = useState<AssetCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 🌟 [paging] แบ่งหน้าตามกลุ่มบริษัทแม่ ไม่ใช่ตามจำนวนแถว
  // ถ้าตัดตามแถวดิบ บริษัทลูกอาจถูกแยกไปคนละหน้ากับแม่ ทำให้อ่านโครงสร้างไม่รู้เรื่อง
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AssetCompany | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/asset-companies');
      if (res.ok) {
        setCompanies(await res.json());
        setCurrentPage(1); // โหลดชุดใหม่แล้วกลับหน้าแรก กันค้างอยู่หน้าที่ไม่มีข้อมูล
      } else showToast('โหลดข้อมูลบริษัทไม่สำเร็จ', 'error');
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchCompanies(); }, []);

  const openModal = (mode: 'CREATE' | 'EDIT', company?: AssetCompany) => {
    setModalMode(mode);
    if (company) {
      setEditingId(company.id);
      setFormData({
        companyCode: company.companyCode,
        companyName: company.companyName,
        address: company.address || '',
        description: company.description || '',
        parentId: company.parentId ? String(company.parentId) : '',
      });
    } else {
      setEditingId(null);
      setFormData(emptyForm);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const url = modalMode === 'EDIT' ? `/api/asset-companies/${editingId}` : '/api/asset-companies';
    const method = modalMode === 'EDIT' ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        showToast(modalMode === 'EDIT' ? 'อัปเดตข้อมูลสำเร็จ!' : 'สร้างบริษัทสำเร็จ!', 'success');
        setIsModalOpen(false);
        fetchCompanies();
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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/asset-companies/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: deleteConfirmInput }),
      });
      if (res.ok) {
        showToast('ลบบริษัทเรียบร้อยแล้ว', 'success');
        setDeleteTarget(null);
        fetchCompanies();
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // 🌟 [asset_hierarchy] ตัวเลือกบริษัทแม่ — เลือกได้เฉพาะบริษัทที่เป็น Primary อยู่แล้ว
  // และต้องไม่ใช่ตัวเอง (รองรับโครงสร้าง 2 ชั้น เหมือนฝั่ง payroll)
  const parentOptions = companies.filter(c => !c.parentId && c.id !== editingId);

  // เรียงรายการเป็นโครงสร้าง: บริษัทแม่ตามด้วยบริษัทลูกของตัวเอง
  // จัดเป็น "กลุ่ม" เพื่อให้แบ่งหน้าได้โดยไม่พรากลูกออกจากแม่
  const groups: { company: AssetCompany; isSub: boolean }[][] = [];
  for (const primary of companies.filter(c => !c.parentId)) {
    const group = [{ company: primary, isSub: false }];
    for (const sub of companies.filter(c => c.parentId === primary.id)) {
      group.push({ company: sub, isSub: true });
    }
    groups.push(group);
  }
  // บริษัทลูกที่ไม่เห็นบริษัทแม่ (ไม่ได้รับสิทธิ์บริษัทแม่) ต้องไม่หายไปจากรายการ
  for (const orphan of companies.filter(
    c => c.parentId && !companies.some(p => p.id === c.parentId),
  )) {
    groups.push([{ company: orphan, isSub: true }]);
  }

  // 🌟 [paging] นับเป็นหน้าตามจำนวน "กลุ่มบริษัทแม่"
  const totalGroups = groups.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pagedGroups = groups.slice(startIndex, startIndex + pageSize);
  const displayRows = pagedGroups.flat();

  return (
    <div className="mx-auto max-w-7xl animate-in fade-in duration-500">
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BiBuilding className="text-2xl" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-800">Company Management</h2>
            <p className="text-sm text-slate-500">ทะเบียนบริษัท — จัดการบริษัทสำหรับบันทึกทรัพย์สิน</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={fetchCompanies} className="flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"><BiRefresh className="mr-2 text-lg" /> Refresh</button>
          <button onClick={() => openModal('CREATE')} className="flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"><BiPlus className="mr-2 text-xl" /> เพิ่มบริษัท</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="animate-pulse p-10 text-center font-semibold text-slate-400">กำลังโหลด...</div>
        ) : companies.length === 0 ? (
          <div className="p-10 text-center font-semibold text-slate-400">
            ยังไม่มีบริษัท คลิก "เพิ่มบริษัท" เพื่อเริ่มต้น
          </div>
        ) : (
          // จำกัดความสูงเพื่อให้ sticky ของหัวตารางทำงาน (ถ้าสูงตามเนื้อหาจะไม่มีอะไรให้ยึด)
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="sticky top-0 z-20 bg-slate-100 text-slate-600 shadow-[0_1px_0_0_rgb(226,232,240)]">
                <tr>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">ชื่อบริษัท</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">เลขทะเบียน</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">ผู้เข้าถึง</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-center">ประเภท</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-center">ที่มา</th>
                  <th className="px-6 py-4 text-right text-xs font-black uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayRows.map(({ company: c, isSub }) => (
                  <tr key={c.id} className={`transition hover:bg-blue-50/50 ${isSub ? 'bg-slate-50/80' : ''}`}>
                    <td className={`px-6 py-4 font-bold text-slate-800 ${isSub ? 'pl-12' : ''}`}>
                      {isSub ? (
                        <span className="flex items-center">
                          <BiSubdirectoryRight className="mr-2 shrink-0 text-xl text-slate-400" />
                          <span className="font-bold text-slate-700">{c.companyName}</span>
                        </span>
                      ) : (
                        c.companyName
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600">{c.companyCode}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {c.members.length === 0 ? (
                          <span className="text-xs font-bold text-amber-600">ไม่มีเจ้าของ</span>
                        ) : (
                          c.members.map((m, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                              {m.isOwner && <BiCrown className="text-amber-500" />}
                              {m.username || 'ไม่มีเจ้าของ'}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase ${isSub ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-indigo-200 bg-indigo-100 text-indigo-700'}`}>
                        {isSub ? 'Sub-Company' : 'Primary'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase ${c.origin === 'ASSET' ? 'border-blue-200 bg-blue-100 text-blue-700' : 'border-slate-300 bg-slate-200 text-slate-600'}`}>
                        {c.origin === 'ASSET' ? 'Asset' : 'Payroll'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openModal('EDIT', c)} className="rounded-lg bg-amber-50 p-2 text-amber-600 shadow-sm transition hover:bg-amber-500 hover:text-white" title="แก้ไข"><BiCog className="text-lg" /></button>
                        {c.origin === 'ASSET' && (
                          <button onClick={() => { setDeleteTarget(c); setDeleteConfirmInput(''); }} className="rounded-lg bg-red-50 p-2 text-red-600 shadow-sm transition hover:bg-red-600 hover:text-white" title="ลบ"><BiTrash className="text-lg" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 🌟 [paging] แถบแบ่งหน้า — นับเป็น "กลุ่มบริษัท" เพื่อไม่ให้บริษัทลูกหลุดไปคนละหน้ากับแม่ */}
        {!isLoading && totalGroups > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>
                แสดง <span className="font-bold text-slate-700">{startIndex + 1}–{Math.min(startIndex + pageSize, totalGroups)}</span>
                {' '}จาก <span className="font-bold text-slate-700">{totalGroups.toLocaleString()}</span> กลุ่มบริษัท
                <span className="ml-1 text-slate-400">({companies.length.toLocaleString()} บริษัททั้งหมด)</span>
              </span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 outline-none focus:border-blue-500"
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} ต่อหน้า</option>)}
              </select>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage(1)} disabled={safePage === 1}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" title="หน้าแรก">«</button>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">ก่อนหน้า</button>
                <span className="px-3 text-sm font-bold text-slate-700">{safePage} / {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">ถัดไป</button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" title="หน้าสุดท้าย">»</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal เพิ่ม/แก้ไข */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className={`flex items-center justify-between px-6 py-4 text-white ${modalMode === 'EDIT' ? 'bg-amber-500' : 'bg-emerald-600'}`}>
              <h3 className="flex items-center text-lg font-bold">
                {modalMode === 'EDIT' ? <BiCog className="mr-2 text-xl" /> : <BiPlus className="mr-2 text-xl" />}
                {modalMode === 'EDIT' ? 'แก้ไขบริษัท' : 'เพิ่มบริษัทใหม่'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full bg-white/20 p-1 transition hover:bg-white/40"><BiX className="text-2xl" /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 bg-slate-50 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">ชื่อบริษัท <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} placeholder="เช่น บริษัท ตัวอย่าง จำกัด" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-blue-50" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">เลขทะเบียนบริษัท <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.companyCode} onChange={e => setFormData({ ...formData, companyCode: e.target.value })} placeholder="เช่น 0105568002346" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-blue-50" />
                <p className="mt-1 text-xs text-slate-400">ต้องไม่ซ้ำกับบริษัทอื่นในระบบ</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">ที่อยู่</label>
                <textarea rows={2} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="ที่อยู่บริษัท" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-blue-50" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">รายละเอียด</label>
                <textarea rows={2} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="รายละเอียดเพิ่มเติม" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-blue-50" />
              </div>

              {/* 🌟 [asset_hierarchy] โครงสร้างบริษัทแม่-ลูก (รองรับ 2 ชั้น) */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Hierarchy Level</label>
                <select value={formData.parentId} onChange={e => setFormData({ ...formData, parentId: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-500">
                  <option value="">--- 👑 Primary Company (บริษัทแม่หลัก) ---</option>
                  {parentOptions.map(c => (
                    <option key={c.id} value={c.id}>↳ Sub-company of: {c.companyName}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-400">
                  บริษัทลูกต้องถูกกำหนดสิทธิ์แยกจากบริษัทแม่ การเป็นสมาชิกบริษัทแม่ไม่ได้ทำให้เห็นทรัพย์สินของบริษัทลูกอัตโนมัติ
                </p>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200">ยกเลิก</button>
                <button type="submit" disabled={isSaving} className={`rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-md transition ${isSaving ? 'bg-slate-400' : modalMode === 'EDIT' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                  {isSaving ? 'กำลังบันทึก...' : modalMode === 'EDIT' ? 'บันทึกการแก้ไข' : 'สร้างบริษัท'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ยืนยันการลบ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between bg-red-600 px-6 py-4 text-white">
              <h3 className="flex items-center text-lg font-bold"><BiErrorCircle className="mr-2 text-xl" /> ลบบริษัทถาวร</h3>
              <button onClick={() => setDeleteTarget(null)} className="rounded-full bg-white/20 p-1 transition hover:bg-white/40"><BiX className="text-2xl" /></button>
            </div>
            <div className="space-y-4 bg-slate-50 p-6">
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p className="mb-1 font-bold">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
                <p>ทรัพย์สินทั้งหมดของบริษัท <span className="font-black">"{deleteTarget.companyName}"</span> รวมถึงประวัติค่าเสื่อมราคาที่ปิดงวดไปแล้ว จะถูกลบถาวร</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  พิมพ์ชื่อบริษัท <span className="font-mono text-red-600">"{deleteTarget.companyName}"</span> เพื่อยืนยัน
                </label>
                <input type="text" value={deleteConfirmInput} onChange={e => setDeleteConfirmInput(e.target.value)} placeholder={deleteTarget.companyName} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-red-500 focus:ring-blue-50" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200">ยกเลิก</button>
                <button type="button" disabled={isDeleting || deleteConfirmInput !== deleteTarget.companyName} onClick={handleConfirmDelete} className={`rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-md transition ${isDeleting || deleteConfirmInput !== deleteTarget.companyName ? 'cursor-not-allowed bg-slate-300' : 'bg-red-600 hover:bg-red-700'}`}>
                  {isDeleting ? 'กำลังลบ...' : 'ลบถาวร'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
