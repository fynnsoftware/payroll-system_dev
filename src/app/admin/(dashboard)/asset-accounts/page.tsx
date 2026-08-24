'use client';

// src/app/admin/(dashboard)/asset-accounts/page.tsx
// 🌟 [asset_redesign] หน้าจัดการบัญชีเข้าระบบ Asset (ADMIN เท่านั้น)
// บัญชีกลุ่มนี้เป็น User ที่ไม่มี Employee ผูก จึงสร้างจากหน้า People Mgt ไม่ได้
// หน้านี้ทำ 2 อย่าง: สร้าง/แก้ไขบัญชี และกำหนดว่าใครเข้าถึงบริษัทไหนได้บ้าง
import React, { useState, useEffect } from 'react';
import {
  BiUserPlus, BiX, BiRefresh, BiTrash, BiKey, BiBuilding,
  BiCrown, BiPlus, BiErrorCircle, BiCheckShield, BiPowerOff,
} from 'react-icons/bi';
import { ToastProvider, useToast } from '@/components/Toast';

interface AccountCompany {
  companyId: number;
  companyName: string;
  isOwner: boolean;
}

interface AssetAccount {
  id: string;
  username: string;
  email: string | null;
  isActive: boolean;
  companies: AccountCompany[];
}

interface CompanyOption {
  id: number;
  companyName: string;
  companyCode: string;
  parentId: number | null;
}

export default function AssetAccountsPage() {
  return (
    <ToastProvider>
      <AssetAccounts />
    </ToastProvider>
  );
}

function AssetAccounts() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<AssetAccount[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '', email: '' });
  const [isSaving, setIsSaving] = useState(false);

  const [memberTarget, setMemberTarget] = useState<AssetAccount | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [asOwner, setAsOwner] = useState(false);

  const [pwTarget, setPwTarget] = useState<AssetAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<AssetAccount | null>(null);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [accRes, compRes] = await Promise.all([
        fetch('/api/asset-accounts'),
        fetch('/api/companies'),
      ]);
      if (accRes.ok) setAccounts(await accRes.json());
      if (compRes.ok) setCompanies(await compRes.json());
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/asset-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (res.ok) {
        showToast('สร้างบัญชีสำเร็จ!', 'success');
        setIsCreateOpen(false);
        setCreateForm({ username: '', password: '', email: '' });
        fetchAll();
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

  const handleToggleActive = async (acc: AssetAccount) => {
    try {
      const res = await fetch(`/api/asset-accounts/${acc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !acc.isActive }),
      });
      if (res.ok) {
        showToast(acc.isActive ? 'ปิดการใช้งานบัญชีแล้ว' : 'เปิดใช้งานบัญชีแล้ว', 'success');
        fetchAll();
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwTarget) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/asset-accounts/${pwTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) {
        showToast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว', 'success');
        setPwTarget(null);
        setNewPassword('');
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

  const handleAddMembership = async () => {
    if (!memberTarget || !selectedCompanyId) return;
    try {
      const res = await fetch('/api/asset-accounts/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: memberTarget.id,
          companyId: Number(selectedCompanyId),
          isOwner: asOwner,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        setSelectedCompanyId('');
        setAsOwner(false);
        const updated = await fetch('/api/asset-accounts').then(r => r.json());
        setAccounts(updated);
        setMemberTarget(updated.find((a: AssetAccount) => a.id === memberTarget.id) || null);
      } else {
        showToast(data.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const handleRemoveMembership = async (companyId: number) => {
    if (!memberTarget) return;
    try {
      const res = await fetch('/api/asset-accounts/membership', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: memberTarget.id, companyId }),
      });
      if (res.ok) {
        showToast('ถอนสิทธิ์เรียบร้อยแล้ว', 'success');
        const updated = await fetch('/api/asset-accounts').then(r => r.json());
        setAccounts(updated);
        setMemberTarget(updated.find((a: AssetAccount) => a.id === memberTarget.id) || null);
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/asset-accounts/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, data.orphanedCompanies > 0 ? 'error' : 'success');
        setDeleteTarget(null);
        fetchAll();
      } else {
        showToast(data.error, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const availableCompanies = companies.filter(
    c => !memberTarget?.companies.some(mc => mc.companyId === c.id),
  );

  // 🌟 แสดงรายการบริษัทแบบมีลำดับชั้น (บริษัทแม่ + บริษัทลูกเยื้องเข้า) ให้เหมือนหน้า People Mgt
  // ⚠️ ต่างจากหน้านั้นตรงที่ไม่ใส่ "(All Sub-Entities)" เพราะการให้สิทธิ์ฝั่ง asset
  // ต้องเลือกทีละบริษัท เลือกบริษัทแม่ไม่ได้หมายความว่าได้สิทธิ์บริษัทลูกด้วย
  const renderCompanyOptions = () => {
    const rendered = new Set<number>();
    const nodes: React.ReactNode[] = [];

    const primaries = availableCompanies.filter(c => !c.parentId);

    for (const primary of primaries) {
      rendered.add(primary.id);
      nodes.push(
        <option key={primary.id} value={primary.id} className="font-bold text-slate-800">
          🏢 {primary.companyName} ({primary.companyCode})
        </option>,
      );
      for (const sub of availableCompanies.filter(c => c.parentId === primary.id)) {
        rendered.add(sub.id);
        nodes.push(
          <option key={sub.id} value={sub.id} className="text-slate-600">
            &nbsp;&nbsp;&nbsp;&nbsp;↳ {sub.companyName} ({sub.companyCode})
          </option>,
        );
      }
    }

    // บริษัทลูกที่บริษัทแม่ถูกกำหนดสิทธิ์ไปแล้ว (จึงไม่อยู่ในรายการ) ต้องไม่หายไปด้วย
    for (const orphan of availableCompanies.filter(c => !rendered.has(c.id))) {
      nodes.push(
        <option key={orphan.id} value={orphan.id} className="text-slate-600">
          ↳ {orphan.companyName} ({orphan.companyCode})
        </option>,
      );
    }

    return nodes;
  };

  return (
    <div className="mx-auto max-w-7xl animate-in fade-in duration-500">
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BiCheckShield className="text-2xl" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-800">Asset User Access</h2>
            <p className="text-sm text-slate-500">จัดการบัญชีผู้ใช้งานระบบทรัพย์สิน และสิทธิ์เข้าถึงรายบริษัท</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={fetchAll} className="flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"><BiRefresh className="mr-2 text-lg" /> Refresh</button>
          <button onClick={() => setIsCreateOpen(true)} className="flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"><BiUserPlus className="mr-2 text-xl" /> สร้างบัญชี</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="animate-pulse p-10 text-center font-semibold text-slate-400">กำลังโหลด...</div>
        ) : accounts.length === 0 ? (
          <div className="p-10 text-center font-semibold text-slate-400">ยังไม่มีบัญชีผู้ใช้งานระบบทรัพย์สิน</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">ชื่อผู้ใช้</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">บริษัทที่เข้าถึงได้</th>
                  <th className="px-6 py-4 text-center text-xs font-black uppercase tracking-wider">สถานะ</th>
                  <th className="px-6 py-4 text-right text-xs font-black uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="transition hover:bg-blue-50/50">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">{acc.username}</div>
                      {acc.email && <div className="text-xs text-slate-400">{acc.email}</div>}
                    </td>
                    <td className="px-6 py-4">
                      {acc.companies.length === 0 ? (
                        <span className="text-xs font-bold text-amber-600">ยังไม่ได้กำหนดบริษัท</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {acc.companies.map((c) => (
                            <span key={c.companyId} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                              {c.isOwner && <BiCrown className="text-amber-500" />}
                              {c.companyName}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase ${acc.isActive ? 'border-green-200 bg-green-100 text-green-700' : 'border-slate-300 bg-slate-200 text-slate-500'}`}>
                        {acc.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setMemberTarget(acc)} className="rounded-lg bg-blue-50 p-2 text-blue-600 shadow-sm transition hover:bg-blue-600 hover:text-white" title="กำหนดบริษัท"><BiBuilding className="text-lg" /></button>
                        <button onClick={() => { setPwTarget(acc); setNewPassword(''); }} className="rounded-lg bg-slate-100 p-2 text-slate-600 shadow-sm transition hover:bg-slate-600 hover:text-white" title="เปลี่ยนรหัสผ่าน"><BiKey className="text-lg" /></button>
                        <button onClick={() => handleToggleActive(acc)} className={`rounded-lg p-2 shadow-sm transition ${acc.isActive ? 'bg-orange-50 text-orange-600 hover:bg-orange-500 hover:text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white'}`} title={acc.isActive ? 'ปิดการใช้งาน' : 'เปิดใช้งาน'}>
                          {acc.isActive ? <BiPowerOff className="text-lg" /> : <BiCheckShield className="text-lg" />}
                        </button>
                        <button onClick={() => setDeleteTarget(acc)} className="rounded-lg bg-red-50 p-2 text-red-600 shadow-sm transition hover:bg-red-600 hover:text-white" title="ลบบัญชี"><BiTrash className="text-lg" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal สร้างบัญชี */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between bg-emerald-600 px-6 py-4 text-white">
              <h3 className="flex items-center text-lg font-bold"><BiUserPlus className="mr-2 text-xl" /> Create Asset User</h3>
              <button onClick={() => setIsCreateOpen(false)} className="rounded-full bg-white/20 p-1 transition hover:bg-white/40"><BiX className="text-2xl" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-5 bg-slate-50 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">ชื่อผู้ใช้ (Username) <span className="text-red-500">*</span></label>
                <input type="text" required value={createForm.username} onChange={e => setCreateForm({ ...createForm, username: e.target.value })} placeholder="เช่น asset.somchai" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-blue-50" />
                <p className="mt-1 text-xs text-slate-400">ต้องไม่ซ้ำกับบัญชีอื่นในระบบ (รวมบัญชีพนักงาน)</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">รหัสผ่าน <span className="text-red-500">*</span></label>
                <input type="text" required value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 font-mono text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-blue-50" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">อีเมล (ไม่บังคับ)</label>
                <input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} placeholder="example@mail.com" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-blue-50" />
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200">ยกเลิก</button>
                <button type="submit" disabled={isSaving} className={`rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-md transition ${isSaving ? 'bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{isSaving ? 'กำลังบันทึก...' : 'สร้างบัญชี'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal กำหนดบริษัท */}
      {memberTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between bg-blue-600 px-6 py-4 text-white">
              <h3 className="flex items-center text-lg font-bold"><BiBuilding className="mr-2 text-xl" /> บริษัทของ {memberTarget.username}</h3>
              <button onClick={() => setMemberTarget(null)} className="rounded-full bg-white/20 p-1 transition hover:bg-white/40"><BiX className="text-2xl" /></button>
            </div>
            <div className="space-y-5 bg-slate-50 p-6">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">บริษัทที่เข้าถึงได้แล้ว</p>
                {memberTarget.companies.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">ยังไม่ได้กำหนดบริษัท — ผู้ใช้จะเห็นหน้าจอว่างเปล่าจนกว่าจะเพิ่มอย่างน้อย 1 บริษัท</p>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {memberTarget.companies.map((c) => (
                      <div key={c.companyId} className="flex items-center justify-between px-4 py-3">
                        <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
                          {c.isOwner && <BiCrown className="text-amber-500" title="เจ้าของ" />}
                          {c.companyName}
                        </span>
                        <button onClick={() => handleRemoveMembership(c.companyId)} className="rounded-lg bg-red-50 p-1.5 text-red-600 transition hover:bg-red-600 hover:text-white" title="ถอนสิทธิ์"><BiTrash /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">เพิ่มบริษัท</p>
                <select value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)} className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-blue-50">
                  <option value="">-- เลือกบริษัท --</option>
                  {renderCompanyOptions()}
                </select>
                <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600">
                  <input type="checkbox" checked={asOwner} onChange={e => setAsOwner(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  ตั้งเป็นเจ้าของบริษัทนี้ (เจ้าของเดิมจะถูกถอดออก)
                </label>
                <button onClick={handleAddMembership} disabled={!selectedCompanyId} className={`flex w-full items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold text-white transition ${selectedCompanyId ? 'bg-blue-600 hover:bg-blue-700' : 'cursor-not-allowed bg-slate-300'}`}>
                  <BiPlus className="mr-2 text-lg" /> เพิ่มสิทธิ์เข้าถึง
                </button>
                <p className="mt-2 text-xs text-slate-400">ถ้าบริษัทยังไม่ได้เปิดโมดูล Assessment ระบบจะเปิดให้อัตโนมัติ</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal เปลี่ยนรหัสผ่าน */}
      {pwTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between bg-slate-700 px-6 py-4 text-white">
              <h3 className="flex items-center text-lg font-bold"><BiKey className="mr-2 text-xl" /> เปลี่ยนรหัสผ่าน</h3>
              <button onClick={() => setPwTarget(null)} className="rounded-full bg-white/20 p-1 transition hover:bg-white/40"><BiX className="text-2xl" /></button>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-4 bg-slate-50 p-6">
              <p className="text-sm text-slate-600">ตั้งรหัสผ่านใหม่ให้ <span className="font-bold">{pwTarget.username}</span></p>
              <input type="text" required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="รหัสผ่านใหม่" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 font-mono text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-blue-50" />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setPwTarget(null)} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200">ยกเลิก</button>
                <button type="submit" disabled={isSaving} className={`rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-md transition ${isSaving ? 'bg-slate-400' : 'bg-slate-700 hover:bg-slate-800'}`}>{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ยืนยันลบบัญชี */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between bg-red-600 px-6 py-4 text-white">
              <h3 className="flex items-center text-lg font-bold"><BiErrorCircle className="mr-2 text-xl" /> ลบบัญชี</h3>
              <button onClick={() => setDeleteTarget(null)} className="rounded-full bg-white/20 p-1 transition hover:bg-white/40"><BiX className="text-2xl" /></button>
            </div>
            <div className="space-y-4 bg-slate-50 p-6">
              <p className="text-sm text-slate-600">
                ลบบัญชี <span className="font-bold">{deleteTarget.username}</span> ถาวรใช่หรือไม่
              </p>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                ข้อมูลบริษัทและทรัพย์สินจะ<span className="font-bold">ไม่ถูกลบ</span>ตามไปด้วย
                {deleteTarget.companies.some(c => c.isOwner) && ' แต่บริษัทที่ผู้ใช้คนนี้เป็นเจ้าของจะกลายเป็น "ไม่มีเจ้าของ" ต้องโอนให้ผู้ใช้คนอื่นภายหลัง'}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200">ยกเลิก</button>
                <button type="button" onClick={handleDelete} className="rounded-xl bg-red-600 px-6 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-red-700">ลบบัญชี</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
