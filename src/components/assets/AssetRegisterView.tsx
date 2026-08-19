'use client';

// src/components/assets/AssetRegisterView.tsx
// 🌟 [Phase 2 - Asset task #19] หน้าจอทะเบียนทรัพย์สิน — Add new, Edit, Search, Display, Terminate
// ⚠️ component กลาง ใช้ร่วมกันทั้งฝั่ง /admin/assets (ธีม Admin) และ /asset/register (ธีม Employee)
// แก้ที่นี่ที่เดียวมีผลทั้งสองฝั่ง — อย่า copy ไปวางซ้ำ
import React, { useState, useEffect, useMemo } from 'react';
import {
  BiPackage, BiPlus, BiX, BiRefresh, BiCog, BiTrash, BiSearch,
  BiPowerOff, BiCheckShield, BiMap,
} from 'react-icons/bi';
import { ToastProvider, useToast } from '@/components/Toast';

interface CompanyOption { id: number; companyName: string; companyCode: string; parentId: number | null; }
interface CategoryOption { id: number; name: string; }

interface Asset {
  id: string;
  assetCode: string;
  companyId: number;
  company: CompanyOption;
  categoryId: number;
  category: CategoryOption;
  description: string;
  location: string | null;
  cost: string | number;
  depreciationRate: string | number;
  purchaseDate: string;
  isActive: boolean;
  openingAccumDepr?: string | number | null;
  openingAsOfDate?: string | null;
  isExpired?: boolean;
  currentNbv?: number;
}

// 🌟 อายุการใช้งานมาตรฐาน -> อัตราค่าเสื่อมต่อปี (เส้นตรง) = 100 / จำนวนปี
// 3 ปีใช้ 33.33% ตามธรรมเนียมบัญชีไทย (ไม่ใช้ 33.3333... เพื่อให้ตัวเลขในรายงานอ่านง่ายและตรงกับ Excel ต้นฉบับ)
const DEPRECIATION_PRESETS = [
  { years: 3, percent: 33.33 },
  { years: 5, percent: 20 },
  { years: 20, percent: 5 },
];

const emptyForm = {
  assetCode: '',
  companyId: '',
  categoryId: '',
  description: '',
  location: '',
  cost: '',
  depreciationRatePercent: '', // ผู้ใช้กรอกเป็น % (เช่น 20) แล้วแปลงเป็น 0.2 ตอนส่ง
  purchaseDate: '',
  openingAccumDepr: '', // 🌟 [phase2asset_#15] ยอดยกมา manual สำหรับทรัพย์สินเก่า (optional)
  openingAsOfDate: '',
};

export default function AssetRegisterView() {
  return (
    <ToastProvider>
      <AssetRegister />
    </ToastProvider>
  );
}

function AssetRegister() {
  const { showToast } = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT' | 'PREVIEW'>('CREATE');
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  // 🌟 โหมดการกรอกอัตราค่าเสื่อม: '' = ยังไม่เลือก, '3'/'5'/'10' = เลือกจากอายุการใช้งาน, 'CUSTOM' = ระบุ % เอง
  const [rateMode, setRateMode] = useState('');

  const handleRateModeChange = (mode: string) => {
    setRateMode(mode);
    const preset = DEPRECIATION_PRESETS.find(p => String(p.years) === mode);
    if (preset) {
      setFormData({ ...formData, depreciationRatePercent: String(preset.percent) });
    } else if (mode === '') {
      setFormData({ ...formData, depreciationRatePercent: '' });
    }
    // mode === 'CUSTOM' -> คงค่าเดิมไว้ให้ผู้ใช้แก้เอง
  };

  const fetchAll = async (searchTerm?: string) => {
    setIsLoading(true);
    try {
      const qs = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
      const [assetsRes, companiesRes, categoriesRes] = await Promise.all([
        fetch(`/api/assets${qs}`),
        fetch('/api/companies'),
        fetch('/api/asset-categories'),
      ]);
      if (assetsRes.ok) setAssets(await assetsRes.json());
      if (companiesRes.ok) setCompanies(await companiesRes.json());
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
    } catch (error) {
      showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAll(search);
  };

  const openModal = (mode: 'CREATE' | 'EDIT' | 'PREVIEW', asset?: Asset) => {
    setModalMode(mode);
    if (asset) {
      setEditingId(asset.id);
      setFormData({
        assetCode: asset.assetCode,
        companyId: String(asset.companyId),
        categoryId: String(asset.categoryId),
        description: asset.description,
        location: asset.location || '',
        cost: String(asset.cost),
        depreciationRatePercent: String(Number(asset.depreciationRate) * 100),
        purchaseDate: asset.purchaseDate.slice(0, 10),
        openingAccumDepr: asset.openingAccumDepr != null ? String(asset.openingAccumDepr) : '',
        openingAsOfDate: asset.openingAsOfDate ? asset.openingAsOfDate.slice(0, 10) : '',
      });

      // 🌟 ถ้าอัตราตรงกับ preset ให้เลือก preset นั้น ไม่ตรงถือว่าเป็นค่าที่กรอกเอง
      const pct = Number(asset.depreciationRate) * 100;
      const matched = DEPRECIATION_PRESETS.find(p => Math.abs(p.percent - pct) < 0.005);
      setRateMode(matched ? String(matched.years) : 'CUSTOM');
    } else {
      setEditingId(null);
      setFormData(emptyForm);
      setRateMode('');
    }
    setIsModalOpen(true);
  };

  // 🌟 Auto display: อายุการใช้งานทั้งหมด + วันที่สิ้นสุดอายุ (คำนวณสดขณะกรอกฟอร์ม)
  const computedLife = useMemo(() => {
    const rate = Number(formData.depreciationRatePercent) / 100;
    if (!rate || rate <= 0 || !formData.purchaseDate) return null;
    const totalDays = Math.round(365 / rate);
    const purchase = new Date(formData.purchaseDate);
    const endDate = new Date(purchase.getTime() + totalDays * 86400000);
    return { totalDays, endDate };
  }, [formData.depreciationRatePercent, formData.purchaseDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === 'PREVIEW') return;

    // 🌟 กันเคสเลือก "กำหนดเอง" แล้วปล่อยช่อง % ว่างไว้
    if (!Number(formData.depreciationRatePercent)) {
      showToast('กรุณาระบุอายุการใช้งาน หรืออัตราค่าเสื่อมราคาต่อปี', 'error');
      return;
    }

    setIsSaving(true);

    const url = modalMode === 'EDIT' ? `/api/assets/${editingId}` : '/api/assets';
    const method = modalMode === 'EDIT' ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetCode: formData.assetCode,
          companyId: formData.companyId,
          categoryId: formData.categoryId,
          description: formData.description,
          location: formData.location,
          cost: formData.cost,
          depreciationRate: Number(formData.depreciationRatePercent) / 100,
          purchaseDate: formData.purchaseDate,
          openingAccumDepr: formData.openingAccumDepr === '' ? null : formData.openingAccumDepr,
          openingAsOfDate: formData.openingAsOfDate === '' ? null : formData.openingAsOfDate,
        }),
      });

      if (res.ok) {
        showToast(modalMode === 'EDIT' ? 'อัปเดตทรัพย์สินสำเร็จ!' : 'บันทึกทรัพย์สินสำเร็จ!', 'success');
        setIsModalOpen(false);
        fetchAll(search);
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

  const handleTerminate = async (asset: Asset) => {
    const action = asset.isActive ? 'Terminate' : 'เปิดใช้งานอีกครั้ง';
    if (!confirm(`คุณแน่ใจหรือไม่ที่จะ ${action} ทรัพย์สิน "${asset.assetCode}"?`)) return;
    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !asset.isActive }),
      });
      if (res.ok) {
        showToast(`${action}ทรัพย์สินสำเร็จ!`, 'success');
        fetchAll(search);
      } else {
        const errData = await res.json();
        showToast(`ดำเนินการไม่สำเร็จ: ${errData.error}`, 'error');
      }
    } catch (error) {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const handleDelete = async (asset: Asset) => {
    if (!confirm(`ลบทรัพย์สิน "${asset.assetCode}" ถาวร?\nแนะนำใช้ Terminate แทนถ้าไม่แน่ใจ`)) return;
    try {
      const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('ลบทรัพย์สินสำเร็จ!', 'success');
        fetchAll(search);
      } else {
        const errData = await res.json();
        showToast(`ลบไม่สำเร็จ: ${errData.error}`, 'error');
      }
    } catch (error) {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  return (
    // ⚠️ ไม่ใส่ padding/พื้นหลัง/min-h-screen ที่นี่ เพราะ layout ที่ครอบอยู่ (ทั้งฝั่ง admin และ /asset)
    // จัดการให้แล้ว ถ้าใส่ซ้ำจะเกิด padding ซ้อนและพื้นหลังไม่ตรงกับธีมของแต่ละฝั่ง
    <div className="mx-auto max-w-7xl animate-in fade-in duration-500">

      {/* 🎨 หัวหน้าจอแบบเบา ไม่ใช้แถบ gradient ก้อนใหญ่ เพราะการ์ดโปรไฟล์ด้านบนเป็นสีเข้มอยู่แล้ว
          ถ้าใส่สองก้อนซ้อนกันจะแย่งสายตาและกินพื้นที่เนื้อหาจริงมากเกินไป */}
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BiPackage className="text-2xl" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-800">Asset Register</h2>
            <p className="text-sm text-slate-500">ทะเบียนทรัพย์สิน — บันทึก แก้ไข ค้นหา และคำนวณค่าเสื่อมราคา</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => fetchAll(search)} className="flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50" title="Refresh"><BiRefresh className="mr-2 text-lg" /> Refresh</button>
          <button onClick={() => openModal('CREATE')} className="flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"><BiPlus className="mr-2 text-xl" /> New Asset</button>
        </div>
      </div>

      <form onSubmit={handleSearch} className="mb-5 flex gap-2">
        <div className="relative flex-1">
          <BiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
          <input
            type="text"
            placeholder="ค้นหาด้วยรหัสทรัพย์สิน หรือรายละเอียด..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 py-2.5 text-sm font-medium outline-none focus:ring-blue-50 focus:border-blue-500"
          />
        </div>
        <button type="submit" className="rounded-xl bg-blue-600 hover:bg-blue-700 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition">ค้นหา</button>
      </form>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-slate-400 font-semibold animate-pulse">Loading assets...</div>
        ) : assets.length === 0 ? (
          <div className="p-10 text-center text-slate-400 font-semibold">ไม่พบทรัพย์สิน คลิก "New Asset" เพื่อเริ่มบันทึก</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs">รหัสทรัพย์สิน</th>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs">รายละเอียด</th>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs">บริษัท</th>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs">ประเภท</th>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs text-right">ราคาทุน</th>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs text-center">สถานะ</th>
                  <th className="px-6 py-4 font-black uppercase tracking-wider text-xs text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.map((a) => (
                  <tr key={a.id} className="hover:bg-blue-50/50 transition">
                    <td className="px-6 py-4 font-mono font-bold text-slate-700">{a.assetCode}</td>
                    <td className="px-6 py-4 font-semibold text-slate-700 flex items-center gap-1.5">
                      {a.description}
                      {a.location && <span className="text-xs text-slate-400 flex items-center gap-0.5"><BiMap /> {a.location}</span>}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{a.company?.companyName}</td>
                    <td className="px-6 py-4 text-slate-600">{a.category?.name}</td>
                    <td className="px-6 py-4 text-right font-mono font-semibold text-slate-700">{Number(a.cost).toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase border ${a.isActive ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
                          {a.isActive ? 'Active' : 'Terminated'}
                        </span>
                        {a.isExpired && (
                          <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase border bg-red-100 text-red-700 border-red-200">
                            หมดอายุ
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openModal('PREVIEW', a)} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-600 hover:text-white transition shadow-sm" title="Preview"><BiSearch className="text-lg" /></button>
                        <button onClick={() => openModal('EDIT', a)} className="p-2 text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-500 hover:text-white transition shadow-sm" title="Edit"><BiCog className="text-lg" /></button>
                        <button
                          onClick={() => handleTerminate(a)}
                          className={`p-2 rounded-lg transition shadow-sm ${a.isActive ? 'text-orange-600 bg-orange-50 hover:bg-orange-500 hover:text-white' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-500 hover:text-white'}`}
                          title={a.isActive ? 'Terminate' : 'Reactivate'}
                        >
                          {a.isActive ? <BiPowerOff className="text-lg" /> : <BiCheckShield className="text-lg" />}
                        </button>
                        <button onClick={() => handleDelete(a)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition shadow-sm" title="Delete"><BiTrash className="text-lg" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className={`flex items-center justify-between px-6 py-4 text-white ${modalMode === 'PREVIEW' ? 'bg-blue-600' : modalMode === 'EDIT' ? 'bg-amber-500' : 'bg-emerald-600'}`}>
              <h3 className="text-lg font-bold flex items-center">
                {modalMode === 'PREVIEW' ? <BiSearch className="mr-2 text-xl" /> : modalMode === 'EDIT' ? <BiCog className="mr-2 text-xl" /> : <BiPlus className="mr-2 text-xl" />}
                {modalMode === 'PREVIEW' ? 'Asset Details' : modalMode === 'EDIT' ? 'Edit Asset' : 'Add New Asset'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-1 bg-white/20 hover:bg-white/40 transition"><BiX className="text-2xl" /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-slate-50">
              {modalMode === 'PREVIEW' && (() => {
                const previewAsset = assets.find(a => a.id === editingId);
                if (!previewAsset?.isExpired) return null;
                return (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm flex items-center justify-between">
                    <span className="font-bold text-red-700">⚠️ ทรัพย์สินนี้หมดอายุแล้ว (ค่าเสื่อมสะสมเต็มจำนวน)</span>
                    {previewAsset.currentNbv !== undefined && (
                      <span className="font-mono font-bold text-red-700">NBV: {previewAsset.currentNbv.toLocaleString()}</span>
                    )}
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">รหัสทรัพย์สิน <span className="text-red-500">*</span></label>
                  <input type="text" required placeholder="เช่น A001" value={formData.assetCode} onChange={e => setFormData({ ...formData, assetCode: e.target.value })} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">ประเภททรัพย์สิน <span className="text-red-500">*</span></label>
                  <select required value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value })} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500">
                    <option value="">-- เลือกประเภท --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">บริษัท <span className="text-red-500">*</span></label>
                <select required value={formData.companyId} onChange={e => setFormData({ ...formData, companyId: e.target.value })} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500">
                  <option value="">-- เลือกบริษัท --</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.companyName} ({c.companyCode})</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">รายละเอียดทรัพย์สิน <span className="text-red-500">*</span></label>
                <input type="text" required placeholder="เช่น โต๊ะสำนักงาน" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700 flex items-center gap-1"><BiMap /> ที่ตั้งทรัพย์สิน</label>
                <input type="text" placeholder="เช่น ชั้น 3 ห้อง IT" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">ราคาทรัพย์สิน <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" min="0" required value={formData.cost} onChange={e => setFormData({ ...formData, cost: e.target.value })} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
                </div>
                {/* 🌟 เลือกอายุการใช้งานเป็นปี แล้วระบบแปลงเป็น %/ปี ให้อัตโนมัติ (เก็บลง DB เป็น % เหมือนเดิม)
                    ถ้าไม่มีในตัวเลือก เลือก "กำหนดเอง" แล้วกรอก % ตรงๆ ได้ */}
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">อายุการใช้งาน <span className="text-red-500">*</span></label>
                  <select required value={rateMode} onChange={e => handleRateModeChange(e.target.value)} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500">
                    <option value="">-- เลือกอายุการใช้งาน --</option>
                    {DEPRECIATION_PRESETS.map(p => (
                      <option key={p.years} value={String(p.years)}>{p.years} ปี ({p.percent}% ต่อปี)</option>
                    ))}
                    <option value="CUSTOM">กำหนดเอง (ระบุ % เอง)</option>
                  </select>
                </div>
              </div>

              {rateMode === 'CUSTOM' ? (
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">อัตราค่าเสื่อมราคาต่อปี (%) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" min="0.01" max="100" required placeholder="เช่น 20" value={formData.depreciationRatePercent} onChange={e => setFormData({ ...formData, depreciationRatePercent: e.target.value })} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
                  {Number(formData.depreciationRatePercent) > 0 && (
                    <p className="mt-1 text-xs text-slate-400">
                      เทียบเท่าอายุการใช้งานประมาณ {(100 / Number(formData.depreciationRatePercent)).toFixed(2)} ปี
                    </p>
                  )}
                </div>
              ) : rateMode !== '' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm">
                  <span className="font-bold text-slate-500">อัตราค่าเสื่อมราคาต่อปี: </span>
                  <span className="font-black text-slate-800">{formData.depreciationRatePercent}%</span>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">วันที่ซื้อ <span className="text-red-500">*</span></label>
                <input type="date" required value={formData.purchaseDate} onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
              </div>

              {/* 🌟 [phase2asset_#15] ยอดยกมา manual สำหรับทรัพย์สินเก่า (optional) — ถ้ากรอกต้องกรอกทั้งคู่ */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">ยอดยกมา (สำหรับทรัพย์สินเก่า — ไม่บังคับ)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-slate-700">ค่าเสื่อมสะสมยกมา</label>
                    <input type="number" step="0.01" min="0" placeholder="0.00" value={formData.openingAccumDepr} onChange={e => setFormData({ ...formData, openingAccumDepr: e.target.value })} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-slate-700">ณ วันที่</label>
                    <input type="date" value={formData.openingAsOfDate} onChange={e => setFormData({ ...formData, openingAsOfDate: e.target.value })} disabled={modalMode === 'PREVIEW'} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-blue-50 focus:border-blue-500 disabled:bg-slate-200 disabled:text-slate-500" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-400">ถ้ากรอกช่องนี้ ระบบจะใช้ยอดนี้เป็นฐานคำนวณแทนวันที่ซื้อ (กรอกทั้งคู่หรือเว้นว่างทั้งคู่)</p>
              </div>

              {computedLife && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">
                  <p className="font-bold text-blue-800 mb-1">คำนวณอัตโนมัติ (Auto display)</p>
                  <p className="text-blue-700">อายุการใช้งานทั้งหมด: <span className="font-bold">{computedLife.totalDays.toLocaleString()} วัน</span></p>
                  <p className="text-blue-700">วันที่สิ้นสุดอายุ: <span className="font-bold">{computedLife.endDate.toLocaleDateString('th-TH')}</span></p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 transition">{modalMode === 'PREVIEW' ? 'Close' : 'Cancel'}</button>
                {modalMode !== 'PREVIEW' && (
                  <button type="submit" disabled={isSaving} className={`rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-md transition ${isSaving ? 'bg-slate-400' : modalMode === 'EDIT' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{isSaving ? 'Saving...' : modalMode === 'EDIT' ? 'Save Changes' : 'Create Asset'}</button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
