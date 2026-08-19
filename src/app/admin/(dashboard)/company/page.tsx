// src/app/admin/companies/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { BiBuilding, BiPlus, BiSubdirectoryRight, BiX, BiRefresh, BiCog, BiTrash, BiSearch, BiImage, BiPowerOff, BiCheckShield, BiErrorCircle } from 'react-icons/bi';
import { ToastProvider, useToast } from '@/components/Toast';

interface Company {
  id: number;
  companyCode: string;
  companyName: string;
  logoUrl: string | null;
  parentId: number | null;
  subCompanies?: Company[];
  address?: string | null;
  description?: string | null;
  preparedBy?: string | null;
  isActive?: boolean;
  terminatedAt?: string | null;
  moduleCodes?: string[];
}

// 🌟 [module_company] module ที่บริษัทเลือกเปิดใช้ได้ (code คงเดิมเพื่อไม่ให้ข้อมูลเดิมพัง)
const MODULE_OPTIONS = [
  { code: 'HR', label: 'Payroll' },
  { code: 'ASSET', label: 'Assessment' },
];

export default function CompanyManagementPage() {
  return (
    <ToastProvider>
      <CompanyManagement />
    </ToastProvider>
  );
}

function CompanyManagement() {
  const { showToast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT' | 'PREVIEW'>('CREATE');
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    companyCode: '',
    companyName: '',
    logoUrl: '',
    parentId: '',
    address: '',
    description: '',
    preparedBy: '',
  });

  // 🌟 [module_company] module ที่ติ๊กไว้ในฟอร์มปัจจุบัน
  const [selectedModules, setSelectedModules] = useState<string[]>([]);

  const toggleModule = (code: string) => {
    setSelectedModules((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const [logoFile, setLogoFile] = useState<File | null>(null);

  // 🌟 [bug_ลบ company] modal ยืนยันแบบพิมพ์ชื่อบริษัทซ้ำ เพราะลบถาวร + cascade ข้อมูล payroll/employee/asset ทั้งหมด
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
      }
    } catch (error) {
      console.error('Failed to fetch companies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchCompanies(); }, []);

  const openModal = (mode: 'CREATE' | 'EDIT' | 'PREVIEW', company?: Company) => {
    setModalMode(mode);
    if (company) {
      setEditingId(company.id);
      setFormData({
        companyCode: company.companyCode,
        companyName: company.companyName,
        logoUrl: company.logoUrl || '',
        parentId: company.parentId ? company.parentId.toString() : '',
        address: company.address || '',
        description: company.description || '',
        preparedBy: company.preparedBy || '',
      });
      setSelectedModules(company.moduleCodes || []);
    } else {
      setEditingId(null);
      setFormData({ companyCode: '', companyName: '', logoUrl: '', parentId: '', address: '', description: '', preparedBy: '' });
      setSelectedModules([]);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === 'PREVIEW') return;
    setIsSaving(true);

    const url = modalMode === 'EDIT' ? `/api/companies/${editingId}` : '/api/companies';
    const method = modalMode === 'EDIT' ? 'PUT' : 'POST';

    const formDataToSend = new FormData();
    formDataToSend.append('companyCode', formData.companyCode);
    formDataToSend.append('companyName', formData.companyName);
    if (formData.parentId) {
      formDataToSend.append('parentId', formData.parentId.toString());
    } else {
      formDataToSend.append('parentId', '');
    }
    formDataToSend.append('address', formData.address);
    formDataToSend.append('description', formData.description);
    formDataToSend.append('moduleCodes', JSON.stringify(selectedModules));

    if (logoFile) formDataToSend.append('logoFile', logoFile);

    try {
      const res = await fetch(url, {
        method,
        body: formDataToSend,
      });

      if (res.ok) {
        showToast(modalMode === 'EDIT' ? 'อัปเดตข้อมูลสำเร็จ!' : 'สร้างบริษัทสำเร็จ!', 'success');
        setIsModalOpen(false);
        setLogoFile(null);
        fetchCompanies();
      } else {
        const errData = await res.json();
        showToast(`เกิดข้อผิดพลาด: ${errData.error}`, 'error');
      }
    } catch (error) {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 🌟 [bug_ลบ company] เปิด modal ยืนยันแทน window.confirm ธรรมดา — ต้องพิมพ์ชื่อบริษัทซ้ำให้ตรงก่อนถึงจะลบได้จริง
  const openDeleteModal = (company: Company) => {
    setDeleteTarget(company);
    setDeleteConfirmInput('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/companies/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: deleteConfirmInput }),
      });
      if (res.ok) {
        showToast('ลบบริษัทและข้อมูลที่เกี่ยวข้องทั้งหมดสำเร็จ!', 'success');
        setDeleteTarget(null);
        fetchCompanies();
      } else {
        const errData = await res.json();
        showToast(`ลบไม่สำเร็จ: ${errData.error}`, 'error');
      }
    } catch (error) {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // 🌟 [Phase 2 - Asset task #17] Terminate / Reactivate (soft-deactivate)
  const handleTerminate = async (id: number, name: string, currentlyActive: boolean) => {
    const action = currentlyActive ? 'Terminate' : 'เปิดใช้งานอีกครั้ง';
    if (!confirm(`คุณแน่ใจหรือไม่ที่จะ ${action} บริษัท "${name}"?`)) return;

    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentlyActive }),
      });
      if (res.ok) {
        showToast(`${action}บริษัทสำเร็จ!`, 'success');
        fetchCompanies();
      } else {
        const errData = await res.json();
        showToast(`ดำเนินการไม่สำเร็จ: ${errData.error}`, 'error');
      }
    } catch (error) {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  // 🌟 จุดสำคัญ: กรองบริษัทที่จะมาเป็น "หัวตาราง" 
  // (ถ้าคนล็อกอินเป็นแม่ จะเห็นแม่เป็นหัวแถว / ถ้าคนล็อกอินเป็นลูก จะเห็นลูกเป็นหัวแถวแทน)
  const displayCompanies = companies.filter(c => 
    c.parentId === null || !companies.find(parent => parent.id === c.parentId)
  );

  const ActionButtons = ({ company }: { company: Company }) => {
    const isActive = company.isActive !== false;
    return (
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => openModal('PREVIEW', company)} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-600 hover:text-white transition shadow-sm" title="Preview"><BiSearch className="text-lg" /></button>
        <button onClick={() => openModal('EDIT', company)} className="p-2 text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-500 hover:text-white transition shadow-sm" title="Edit"><BiCog className="text-lg" /></button>
        <button
          onClick={() => handleTerminate(company.id, company.companyName, isActive)}
          className={`p-2 rounded-lg transition shadow-sm ${isActive ? 'text-orange-600 bg-orange-50 hover:bg-orange-500 hover:text-white' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-500 hover:text-white'}`}
          title={isActive ? 'Terminate' : 'Reactivate'}
        >
          {isActive ? <BiPowerOff className="text-lg" /> : <BiCheckShield className="text-lg" />}
        </button>
        <button onClick={() => openDeleteModal(company)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition shadow-sm" title="Delete"><BiTrash className="text-lg" /></button>
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-500 bg-slate-50 min-h-screen">
      
      <div className="mb-8 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-800 p-8 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black flex items-center tracking-tight">
            <BiBuilding className="mr-3 text-4xl text-blue-300" /> Company Management
          </h2>
          <p className="mt-2 text-blue-100 font-medium">Manage primary holding companies and subsidiaries</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchCompanies} className="flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2.5 text-sm font-bold backdrop-blur-sm transition"><BiRefresh className="mr-2 text-lg" /> Refresh</button>
          <button onClick={() => openModal('CREATE')} className="flex items-center justify-center rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2.5 text-sm font-bold shadow-md transition"><BiPlus className="mr-2 text-xl" /> New Company</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-slate-400 font-semibold animate-pulse">Loading company structures...</div>
        ) : displayCompanies.length === 0 ? (
          <div className="p-10 text-center text-slate-400 font-semibold">No companies found. Click "New Company" to start.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs">Company Info</th>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs">Company Code</th>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs text-center">Type</th>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs text-center">Status</th>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayCompanies.map((main) => (
                  <React.Fragment key={main.id}>
                    <tr className="hover:bg-blue-50/50 transition">
                      <td className="px-6 py-5 flex items-center">
                        <div className="h-12 w-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center mr-4 shadow-sm overflow-hidden shrink-0">
                          {main.logoUrl ? <img src={main.logoUrl} alt="logo" className="h-full w-full object-contain p-1" /> : <BiBuilding className="text-2xl text-slate-300" />}
                        </div>
                        <span className="font-black text-slate-800 text-base">{main.companyName}</span>
                      </td>
                      <td className="px-6 py-5 font-mono font-bold text-slate-600">{main.companyCode}</td>
                      <td className="px-6 py-5 text-center">
                        {/* 🌟 เปลี่ยนสีป้ายสถานะตามความเป็นจริง */}
                        <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border shadow-sm ${main.parentId === null ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                          {main.parentId === null ? 'Primary' : 'Sub-Company'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border shadow-sm ${main.isActive === false ? 'bg-slate-200 text-slate-500 border-slate-300' : 'bg-green-100 text-green-700 border-green-200'}`}>
                          {main.isActive === false ? 'Terminated' : 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-5"><ActionButtons company={main} /></td>
                    </tr>
                    
                    {main.subCompanies?.map((sub) => (
                      <tr key={sub.id} className="bg-slate-50/80 hover:bg-slate-100 transition">
                        <td className="px-6 py-4 pl-14 flex items-center">
                          <BiSubdirectoryRight className="mr-3 text-slate-400 text-2xl shrink-0" />
                          <div className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center mr-3 shadow-sm overflow-hidden shrink-0">
                            {sub.logoUrl ? <img src={sub.logoUrl} alt="logo" className="h-full w-full object-contain p-0.5" /> : <BiBuilding className="text-slate-300" />}
                          </div>
                          <span className="font-bold text-slate-700">{sub.companyName}</span>
                        </td>
                        <td className="px-6 py-4 font-mono font-semibold text-slate-500 text-sm">{sub.companyCode}</td>
                        <td className="px-6 py-4 text-center">
                          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[11px] font-bold uppercase border border-emerald-200">
                            Sub-Company
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase border ${sub.isActive === false ? 'bg-slate-200 text-slate-500 border-slate-300' : 'bg-green-100 text-green-700 border-green-200'}`}>
                            {sub.isActive === false ? 'Terminated' : 'Active'}
                          </span>
                        </td>
                        <td className="px-6 py-4"><ActionButtons company={sub} /></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            
            <div className={`flex items-center justify-between px-6 py-4 text-white ${modalMode === 'PREVIEW' ? 'bg-blue-600' : modalMode === 'EDIT' ? 'bg-amber-500' : 'bg-emerald-600'}`}>
              <h3 className="text-lg font-bold flex items-center">
                {modalMode === 'PREVIEW' ? <BiSearch className="mr-2 text-xl" /> : modalMode === 'EDIT' ? <BiCog className="mr-2 text-xl" /> : <BiPlus className="mr-2 text-xl" />}
                {modalMode === 'PREVIEW' ? 'Company Details' : modalMode === 'EDIT' ? 'Edit Company' : 'Add New Company'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-1 bg-white/20 hover:bg-white/40 transition"><BiX className="text-2xl" /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-slate-50">
              {modalMode === 'PREVIEW' && formData.logoUrl && (
                <div className="flex justify-center mb-6">
                  <div className="h-24 w-24 rounded-2xl border-4 border-white shadow-lg bg-white overflow-hidden p-2">
                    <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">Company Name <span className="text-red-500">*</span></label>
                <input type="text" required placeholder="e.g. 2C2P Thailand Co., Ltd." value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">Company Registration No. <span className="text-red-500">*</span></label>
                <input type="text" required placeholder="e.g. 2C2P-TH" value={formData.companyCode} onChange={e => setFormData({...formData, companyCode: e.target.value})} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
              </div>

              {modalMode !== 'PREVIEW' && (
                <div>
                  <label className="mb-1.5 flex items-center text-sm font-bold text-slate-700">
                    <BiImage className="mr-1 text-slate-400" /> Upload Logo (Optional)
                  </label>
                  <input type="file" accept="image/png, image/jpeg, image/svg+xml" onChange={e => { if (e.target.files && e.target.files.length > 0) setLogoFile(e.target.files[0]); }} className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition cursor-pointer" />
                </div>
              )}

              {/* 🌟 [Phase 2 - Asset] field ใหม่ตาม requirement doc หน้าจอทะเบียนบริษัท */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">ที่อยู่ (Address)</label>
                <textarea rows={2} placeholder="ที่อยู่บริษัท" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">รายละเอียด (Description)</label>
                <textarea rows={2} placeholder="รายละเอียดเพิ่มเติม" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
              </div>

              {modalMode === 'PREVIEW' && formData.preparedBy && (
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">ผู้จัดทำ</label>
                  <input type="text" disabled value={formData.preparedBy} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-500 bg-slate-200" />
                </div>
              )}

              {/* 🌟 [module_company] เลือก module ที่บริษัทนี้เปิดใช้งาน */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-slate-500">Module ที่เปิดใช้งาน</label>
                <div className="space-y-2">
                  {MODULE_OPTIONS.map((mod) => (
                    <label
                      key={mod.code}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${modalMode === 'PREVIEW' ? 'cursor-default border-slate-200 bg-slate-50' : 'cursor-pointer border-slate-300 hover:border-blue-400 hover:bg-blue-50/50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedModules.includes(mod.code)}
                        onChange={() => toggleModule(mod.code)}
                        disabled={modalMode === 'PREVIEW'}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-bold text-slate-700">{mod.label}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-400">ผู้ใช้งานของบริษัทนี้จะเห็นเฉพาะเมนูของ module ที่เปิดไว้ ถ้าเปิดทั้ง 2 จะเห็นทั้งหมด</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 mt-2 shadow-sm">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Hierarchy Level</label>
                <select value={formData.parentId} onChange={e => setFormData({...formData, parentId: e.target.value})} disabled={modalMode === 'PREVIEW'} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400">
                  <option value="">--- 👑 Primary Company (บริษัทแม่หลัก) ---</option>
                  {displayCompanies.filter(c => c.id !== editingId).map(company => (
                    <option key={company.id} value={company.id}>↳ Sub-company of: {company.companyName}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 transition">{modalMode === 'PREVIEW' ? 'Close' : 'Cancel'}</button>
                {modalMode !== 'PREVIEW' && (
                  <button type="submit" disabled={isSaving} className={`rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-md transition ${isSaving ? 'bg-slate-400' : modalMode === 'EDIT' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{isSaving ? 'Saving...' : modalMode === 'EDIT' ? 'Save Changes' : 'Create Company'}</button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🌟 [bug_ลบ company] modal ยืนยันการลบถาวร — ต้องพิมพ์ชื่อบริษัทให้ตรงเป๊ะก่อนถึงจะลบได้ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 text-white bg-red-600">
              <h3 className="text-lg font-bold flex items-center"><BiErrorCircle className="mr-2 text-xl" /> ลบบริษัทถาวร</h3>
              <button onClick={() => setDeleteTarget(null)} className="rounded-full p-1 bg-white/20 hover:bg-white/40 transition"><BiX className="text-2xl" /></button>
            </div>
            <div className="p-6 space-y-4 bg-slate-50">
              {(deleteTarget.subCompanies?.length ?? 0) > 0 ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                  ไม่สามารถลบบริษัทนี้ได้ เนื่องจากยังมีบริษัทลูกสังกัดอยู่ {deleteTarget.subCompanies?.length} บริษัท กรุณาลบบริษัทลูกออกให้หมดก่อน
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    <p className="font-bold mb-1">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
                    <p>ระบบจะลบข้อมูลที่เกี่ยวข้องกับบริษัท <span className="font-black">"{deleteTarget.companyName}"</span> ทั้งหมดถาวร ได้แก่ พนักงานและบัญชีผู้ใช้งาน (login) ของพนักงาน, ประวัติเงินเดือน (Payroll), ประวัตินำเข้า Excel เงินเดือน, และทะเบียนทรัพย์สิน (Asset) ทั้งหมดของบริษัทนี้</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-slate-700">
                      พิมพ์ชื่อบริษัท <span className="font-mono text-red-600">"{deleteTarget.companyName}"</span> เพื่อยืนยัน
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmInput}
                      onChange={(e) => setDeleteConfirmInput(e.target.value)}
                      placeholder={deleteTarget.companyName}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-red-500"
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 transition">ยกเลิก</button>
                {(deleteTarget.subCompanies?.length ?? 0) === 0 && (
                  <button
                    type="button"
                    disabled={isDeleting || deleteConfirmInput !== deleteTarget.companyName}
                    onClick={handleConfirmDelete}
                    className={`rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-md transition ${isDeleting || deleteConfirmInput !== deleteTarget.companyName ? 'bg-slate-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                    {isDeleting ? 'กำลังลบ...' : 'ลบถาวร'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}