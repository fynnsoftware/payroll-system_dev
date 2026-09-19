'use client';

// src/components/assets/AssetReportView.tsx
// 🌟 [Phase 2 - Asset task #20, #21, #22] หน้าจอแสดงรายการทรัพย์สิน + Report 2 sheet (สรุป / รายละเอียด)
// ⚠️ component กลาง ใช้ร่วมกันทั้งฝั่ง /admin/assets-report (ธีม Admin) และ /asset/report (ธีม Employee)
// แก้ที่นี่ที่เดียวมีผลทั้งสองฝั่ง — อย่า copy ไปวางซ้ำ
import React, { useState, useEffect } from 'react';
import { BiBarChartAlt2, BiRefresh, BiBuilding, BiX, BiListUl, BiTable, BiSpreadsheet, BiSearch } from 'react-icons/bi';
import { ToastProvider, useToast } from '@/components/Toast';
import { formatDate, bangkokYear } from '@/lib/datetime';
import { formatRateWithYears } from '@/lib/depreciation';
import { exportAssetReport } from '@/lib/assetReportExport';

// 🌟 [asset_hierarchy] ทะเบียนบริษัทฝั่ง asset รองรับโครงสร้างแม่-ลูก 2 ชั้นแล้ว
interface CompanyOption { id: number; companyName: string; companyCode: string; parentId?: number | null; }
// 🌟 [report_filter] ตัวเลือกกรองเพิ่มเติม — ประเภททรัพย์สิน / ผังบัญชี (ของบริษัทที่เลือกอยู่)
interface AccountTypeOption { id: number; code: string; name: string; }
interface CategoryOption { id: number; name: string; codePrefix: string | null; accountTypeId: number | null; }

interface DetailRow {
  assetCode: string;
  category: string;
  accountCode: string | null;
  accountName: string | null;
  description: string;
  location: string | null;
  companyName: string;
  depreciationRate: number;
  purchaseDate: string;
  endOfLifeDate: string;
  totalUsefulLifeDays: number;
  daysUsedTotal: number;
  calcType: string;
  calcCondition: string;
  cost: number;
  accumDeprBF: number;
  depreciationCurrentPeriod: number;
  accumDeprCF: number;
  nbv: number;
  isExpired: boolean;
}

interface Totals { cost: number; accumDeprBF: number; depreciationCurrentPeriod: number; accumDeprCF: number; nbv: number }

interface SummaryGroup {
  category: string;
  items: DetailRow[];
  subtotal: Totals;
}

// 🌟 [account_group] ชั้นบนของแท็บสรุป — จัดกลุ่มตามผังบัญชีก่อน แล้วค่อยแยกตามประเภททรัพย์สิน
interface AccountGroup {
  accountCode: string | null;
  accountName: string | null;
  categories: SummaryGroup[];
  accountTotal: Totals;
}

interface ReportData {
  companyName: string;
  periodEndDate: string;
  periodStartDate: string;
  summary: SummaryGroup[];
  summaryByAccount: AccountGroup[];
  detail: DetailRow[];
  grandTotal: { cost: number; accumDeprBF: number; depreciationCurrentPeriod: number; accumDeprCF: number; nbv: number };
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AssetReportView() {
  return (
    <ToastProvider>
      <AssetReport />
    </ToastProvider>
  );
}

function AssetReport() {
  const { showToast } = useToast();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [includeSub, setIncludeSub] = useState(true);
  // 🌟 [report_filter] '' = ทั้งหมด
  const [categoryId, setCategoryId] = useState('');
  const [accountTypeId, setAccountTypeId] = useState('');
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [accountTypes, setAccountTypes] = useState<AccountTypeOption[]>([]);
  const [year, setYear] = useState(bangkokYear()); // 🌟 [timezone] ยึดเวลาไทย
  const [tab, setTab] = useState<'SUMMARY' | 'DETAIL'>('SUMMARY');
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<DetailRow | null>(null);

  useEffect(() => {
    // 🌟 [asset_redesign] ใช้ทะเบียนบริษัทฝั่ง asset แทน /api/companies ของฝั่ง payroll
    fetch('/api/asset-companies').then(res => res.ok ? res.json() : []).then((data: CompanyOption[]) => {
      setCompanies(data);
      // เลือกบริษัทแรกที่เข้าถึงได้ให้อัตโนมัติ
      if (data.length > 0) setCompanyId(String(data[0].id));
    });
  }, []);

  // 🌟 [report_filter] ประเภททรัพย์สินและผังบัญชีแยกตามบริษัท จึงต้องโหลดใหม่ทุกครั้งที่สลับบริษัท
  // และล้างตัวกรองเดิมทิ้ง เพราะ id ของบริษัทเก่าไม่มีอยู่ในบริษัทใหม่
  // (ถ้าปล่อยค้างไว้ รายงานจะออกมา 0 รายการแบบไม่มีเหตุผลให้ผู้ใช้เข้าใจ)
  useEffect(() => {
    setCategoryId('');
    setAccountTypeId('');
    if (!companyId) { setCategories([]); setAccountTypes([]); return; }
    Promise.all([
      fetch(`/api/asset-categories?companyId=${companyId}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/asset-account-types?companyId=${companyId}`).then(r => r.ok ? r.json() : []),
    ]).then(([cats, accs]) => { setCategories(cats); setAccountTypes(accs); })
      .catch(() => { setCategories([]); setAccountTypes([]); });
  }, [companyId]);

  // เลือกผังบัญชีแล้ว ตัวเลือกประเภททรัพย์สินควรเหลือเฉพาะที่ผูกบัญชีนั้น
  // ไม่งั้นผู้ใช้เลือกสองอย่างที่ขัดกันเองแล้วได้รายงานว่างโดยไม่รู้ว่าทำไม
  const visibleCategories = accountTypeId
    ? categories.filter(c => String(c.accountTypeId ?? '') === accountTypeId)
    : categories;

  // 🌟 [report_filter] ข้อความสรุปตัวกรองที่ใช้อยู่ ใช้ทั้งบนหน้าจอและในไฟล์ Excel
  const filterNotes: string[] = [];
  {
    const acc = accountTypes.find(a => String(a.id) === accountTypeId);
    const cat = categories.find(c => String(c.id) === categoryId);
    if (acc) filterNotes.push(`ประเภทบัญชี: ${acc.code} ${acc.name}`);
    if (cat) filterNotes.push(`ประเภททรัพย์สิน: ${cat.name}`);
  }

  const runReport = async () => {
    if (!companyId) { showToast('กรุณาเลือกบริษัทก่อน', 'error'); return; }
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ companyId, includeSubCompanies: String(includeSub), year: String(year) });
      if (categoryId) params.set('categoryId', categoryId);
      if (accountTypeId) params.set('accountTypeId', accountTypeId);
      const res = await fetch(`/api/assets/report?${params}`);
      if (res.ok) {
        setReport(await res.json());
      } else {
        const err = await res.json();
        showToast(`ดึงรายงานไม่สำเร็จ: ${err.error}`, 'error');
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (companyId) runReport(); /* eslint-disable-next-line */ }, [companyId]);

  // 🌟 [asset_report] ส่งออก Excel — ใช้ข้อมูลชุดเดียวกับที่แสดงบนหน้าจอ ไม่ยิง API ซ้ำ
  // จึงมั่นใจได้ว่าไฟล์ที่ได้ตรงกับตัวเลขที่เห็นอยู่ตรงหน้าเป๊ะ
  const handleExport = (target: 'SUMMARY' | 'DETAIL' | 'BOTH') => {
    if (!report) {
      showToast('ยังไม่มีข้อมูลรายงานให้ส่งออก', 'error');
      return;
    }
    if (report.detail.length === 0) {
      showToast('ไม่มีรายการทรัพย์สินในเงื่อนไขที่เลือก', 'error');
      return;
    }
    try {
      // แนบตัวกรองที่ใช้อยู่ไปกับไฟล์ ไม่งั้นคนเปิดไฟล์ทีหลังจะนึกว่าเป็นยอดทั้งบริษัท
      const fileName = exportAssetReport({ ...report, filterNotes }, target, year);
      showToast(`ส่งออกไฟล์ ${fileName} เรียบร้อยแล้ว`, 'success');
    } catch (error) {
      console.error('Export Excel Error:', error);
      showToast('ส่งออกไฟล์ไม่สำเร็จ', 'error');
    }
  };

  return (
    // ⚠️ padding/พื้นหลัง ปล่อยให้ layout ที่ครอบอยู่จัดการ (ดูหมายเหตุใน AssetRegisterView)
    <div className="mx-auto max-w-7xl animate-in fade-in duration-500">
      {/* 🎨 หัวหน้าจอแบบเบา (ดูหมายเหตุใน AssetRegisterView) */}
      <div className="mb-6 flex items-center gap-3 border-b border-slate-200 pb-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <BiBarChartAlt2 className="text-2xl" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-800">Asset Report</h2>
          <p className="text-sm text-slate-500">รายงานทะเบียนทรัพย์สิน — สรุปตามประเภท และรายละเอียดรายตัว</p>
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">บริษัท</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-blue-50 focus:border-blue-500">
            <option value="">-- เลือกบริษัท --</option>
            {(() => {
              // 🌟 [asset_hierarchy] แสดงเป็นลำดับชั้น บริษัทแม่ตามด้วยบริษัทลูก
              const rendered = new Set<number>();
              const nodes: React.ReactNode[] = [];
              for (const primary of companies.filter(c => !c.parentId)) {
                rendered.add(primary.id);
                nodes.push(<option key={primary.id} value={primary.id} className="font-bold">🏢 {primary.companyName}</option>);
                for (const sub of companies.filter(c => c.parentId === primary.id)) {
                  rendered.add(sub.id);
                  nodes.push(<option key={sub.id} value={sub.id}>&nbsp;&nbsp;&nbsp;&nbsp;↳ {sub.companyName}</option>);
                }
              }
              for (const orphan of companies.filter(c => !rendered.has(c.id))) {
                nodes.push(<option key={orphan.id} value={orphan.id}>↳ {orphan.companyName}</option>);
              }
              return nodes;
            })()}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">รอบปี (Fiscal Year)</label>
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-32 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-blue-50 focus:border-blue-500" />
        </div>
        {/* 🌟 [report_filter] กรองตามผังบัญชี — วางก่อนประเภททรัพย์สินเพราะเป็นตัวกรองที่กว้างกว่า */}
        <div className="min-w-[200px] flex-1">
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ประเภทบัญชี</label>
          <select
            value={accountTypeId}
            onChange={e => { setAccountTypeId(e.target.value); setCategoryId(''); }}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-blue-50 focus:border-blue-500"
          >
            <option value="">ทุกประเภทบัญชี</option>
            {accountTypes.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </div>

        <div className="min-w-[180px] flex-1">
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">ประเภททรัพย์สิน</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-blue-50 focus:border-blue-500"
          >
            <option value="">ทุกประเภททรัพย์สิน</option>
            {visibleCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* 🌟 [asset_hierarchy] รวมบริษัทลูก — นับเฉพาะบริษัทลูกที่ผู้ใช้มีสิทธิ์เข้าถึงเท่านั้น
            (backend กรองด้วย assetScope อีกชั้น การเป็นสมาชิกบริษัทแม่ไม่ได้เห็นลูกอัตโนมัติ) */}
        <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={includeSub} onChange={e => setIncludeSub(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          รวมบริษัทลูกในเครือ (Group Company)
        </label>
        <button onClick={runReport} className="rounded-xl bg-blue-600 hover:bg-blue-700 px-6 py-2.5 text-sm font-bold text-white shadow-md transition flex items-center gap-2">
          <BiRefresh className={isLoading ? 'animate-spin' : ''} /> {isLoading ? 'กำลังคำนวณ...' : 'สร้างรายงาน'}
        </button>
      </div>

      {report && (
        <>
          {/* Report header — ตาม template Excel ต้นฉบับ */}
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <p><span className="font-bold text-slate-500">ชื่อบริษัท:</span> <span className="font-black text-slate-800 flex items-center gap-1"><BiBuilding /> {report.companyName}{includeSub && ' (รวมบริษัทลูก)'}</span></p>
              <p><span className="font-bold text-slate-500">วันสิ้นงวดบัญชี:</span> <span className="font-black text-slate-800">{formatDate(report.periodEndDate)}</span></p>
              <p><span className="font-bold text-slate-500">ช่วงงวด:</span> <span className="font-black text-slate-800">{formatDate(report.periodStartDate)} - {formatDate(report.periodEndDate)}</span></p>
            </div>

            {/* 🌟 [report_filter] เตือนให้ชัดว่ายอดรวมเป็นยอดเฉพาะที่กรองแล้ว ไม่ใช่ยอดทั้งบริษัท */}
            {filterNotes.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-xs">
                <span className="font-bold text-amber-700">กรองอยู่:</span>
                {filterNotes.map(n => (
                  <span key={n} className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-200">{n}</span>
                ))}
                <span className="text-slate-400">— ยอดรวมด้านล่างเป็นยอดเฉพาะที่กรองแล้ว</span>
              </div>
            )}
          </div>

          {/* Tabs = 2 sheet + ปุ่ม export ตามแท็บที่เปิดอยู่ */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button onClick={() => setTab('SUMMARY')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'SUMMARY' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}><BiListUl /> สรุปทะเบียนทรัพย์สิน</button>
            <button onClick={() => setTab('DETAIL')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'DETAIL' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}><BiTable /> ข้อมูลทะเบียนทรัพย์สิน</button>

            <div className="ml-auto flex gap-2">
              <button
                onClick={() => handleExport(tab)}
                className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
                title="ส่งออกเฉพาะแท็บที่เปิดอยู่"
              >
                <BiSpreadsheet className="text-lg" /> Export แท็บนี้
              </button>
              <button
                onClick={() => handleExport('BOTH')}
                className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                title="ส่งออกทั้ง 2 แท็บในไฟล์เดียว"
              >
                <BiSpreadsheet className="text-lg" /> Export ทั้งหมด
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
            {tab === 'SUMMARY' ? <SummarySheet report={report} onSelectRow={setSelectedRow} /> : <DetailSheet report={report} onSelectRow={setSelectedRow} />}
          </div>
        </>
      )}

      {selectedRow && <RowDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  );
}

// 🌟 [asset_report] ตาราง "สรุปทะเบียนทรัพย์สิน" รูปแบบ pivot ตาม template
// หัวตาราง 2 ชั้น: แถวบนมีแถบ "Values" คร่อมคอลัมน์ตัวเลขทั้ง 5 (เลียนแบบ pivot table ของ Excel)
// คอลัมน์แยกเป็น ประเภท / รหัส / รายละเอียด / อัตราค่าเสื่อม แล้วตามด้วยกลุ่มคอลัมน์ตัวเลข
function SummarySheet({ report, onSelectRow }: { report: ReportData; onSelectRow: (row: DetailRow) => void }) {
  // 🌟 [readability] หัวตารางใช้ text-sm เท่ากับเนื้อตารางและแถบหัวบัญชี
  // เดิมเป็น text-[11px] ซึ่งเล็กกว่าเนื้อข้างล่างจนอ่านชื่อคอลัมน์ภาษาไทยยาวๆ ลำบาก
  const thBase = 'px-4 py-3 font-black tracking-wide text-sm';
  const dimCols = 4; // จำนวนคอลัมน์ที่ไม่ใช่ตัวเลข (ประเภท/รหัส/รายละเอียด/อัตรา)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
          <tr>
            <th className="border-b border-slate-200" colSpan={dimCols} />
            <th
              className="border-b border-l border-slate-300 bg-slate-200/70 px-4 py-2 text-center text-sm font-black uppercase tracking-widest text-slate-600"
              colSpan={5}
            >
              Values
            </th>
          </tr>
          <tr>
            <th className={thBase}>ประเภททรัพย์สิน</th>
            <th className={thBase}>รหัสทรัพย์สิน</th>
            <th className={thBase}>รายละเอียดทรัพย์สิน</th>
            <th className={`${thBase} text-right`}>อัตราค่าเสื่อมราคาต่อปี</th>
            <th className={`${thBase} border-l border-slate-300 text-right`}>ราคาทุน</th>
            <th className={`${thBase} text-right`}>ค่าเสื่อมสะสมยกมา</th>
            <th className={`${thBase} text-right`}>ค่าเสื่อมราคา</th>
            <th className={`${thBase} text-right`}>ค่าเสื่อมสะสมยกไป</th>
            <th className={`${thBase} text-right`}>มูลค่าตามบัญชียกไป</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {report.summaryByAccount.map((acc) => (
            <React.Fragment key={acc.accountCode ?? 'NO_ACCOUNT'}>
              {/* 🌟 [account_group] แถบหัวกลุ่มบัญชี — คร่อมทั้งแถวให้เห็นชัดว่าข้างล่างอยู่ใต้บัญชีไหน */}
              <tr className="bg-indigo-50/80">
                <td colSpan={dimCols + 5} className="px-4 py-3 text-base font-black text-indigo-900">
                  ประเภทบัญชี:{' '}
                  {acc.accountCode
                    ? <>{acc.accountName} <span className="font-mono font-bold">({acc.accountCode})</span></>
                    : <span className="text-slate-500">ไม่ระบุบัญชี</span>}
                </td>
              </tr>

              {acc.categories.map((g) => (
            <React.Fragment key={g.category}>
              {/* 🌟 [row_detail] คลิกแถวเพื่อดูรายละเอียดรายตัว เหมือนแท็บ "ข้อมูลทะเบียนทรัพย์สิน"
                  ใช้ popup ตัวเดียวกัน (RowDetailModal) ข้อมูลจึงตรงกันแน่นอนทั้งสองแท็บ
                  ⚠️ เฉพาะแถวทรัพย์สินเท่านั้น แถวรวมประเภท/รวมบัญชี/Grand Total คลิกไม่ได้
                  ⚠️ คอมเมนต์ JSX ต้องอยู่นอก map() — วางไว้ในตัว map โดยตรง JSX จะตีเป็น object แล้ว parse พัง */}
              {g.items.map((row, i) => (
                <tr
                  key={row.assetCode}
                  onClick={() => onSelectRow(row)}
                  title="คลิกเพื่อดูรายละเอียด"
                  className="group cursor-pointer text-slate-600 transition hover:bg-blue-50/50"
                >
                  {/* แสดงชื่อประเภทเฉพาะแถวแรกของกลุ่ม เหมือน pivot ที่ไม่พิมพ์ค่าซ้ำ */}
                  <td className="px-4 py-2.5 font-semibold text-slate-700">
                    {i === 0 ? g.category : ''}
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    <span className="inline-flex items-center gap-1.5">
                      {row.assetCode}
                      <BiSearch className="text-sm text-slate-300 opacity-0 transition group-hover:opacity-100" />
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{row.description}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatRateWithYears(row.depreciationRate, row.totalUsefulLifeDays)}</td>
                  <td className="px-4 py-2.5 border-l border-slate-200 text-right font-mono">{fmt(row.cost)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(row.accumDeprBF)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(row.depreciationCurrentPeriod)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(row.accumDeprCF)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(row.nbv)}</td>
                </tr>
              ))}
              <tr className="bg-amber-50 font-black text-slate-800">
                <td className="px-4 py-2.5" colSpan={dimCols}>{g.category} Total</td>
                <td className="px-4 py-2.5 border-l border-amber-200 text-right font-mono">{fmt(g.subtotal.cost)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(g.subtotal.accumDeprBF)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(g.subtotal.depreciationCurrentPeriod)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(g.subtotal.accumDeprCF)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(g.subtotal.nbv)}</td>
              </tr>
            </React.Fragment>
              ))}

              {/* 🌟 [account_group] ยอดรวมระดับบัญชี — ตัวเลขที่เอาไปกระทบกับงบจริง */}
              <tr className="bg-indigo-100 font-black text-indigo-900">
                <td className="px-4 py-2.5" colSpan={dimCols}>
                  รวมบัญชี {acc.accountCode ? `${acc.accountName} (${acc.accountCode})` : 'ไม่ระบุบัญชี'}
                </td>
                <td className="px-4 py-2.5 border-l border-indigo-200 text-right font-mono">{fmt(acc.accountTotal.cost)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(acc.accountTotal.accumDeprBF)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(acc.accountTotal.depreciationCurrentPeriod)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(acc.accountTotal.accumDeprCF)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(acc.accountTotal.nbv)}</td>
              </tr>
            </React.Fragment>
          ))}
          <tr className="bg-slate-800 text-white font-black">
            <td className="px-4 py-3" colSpan={dimCols}>Grand Total</td>
            <td className="px-4 py-3 border-l border-slate-600 text-right font-mono">{fmt(report.grandTotal.cost)}</td>
            <td className="px-4 py-3 text-right font-mono">{fmt(report.grandTotal.accumDeprBF)}</td>
            <td className="px-4 py-3 text-right font-mono">{fmt(report.grandTotal.depreciationCurrentPeriod)}</td>
            <td className="px-4 py-3 text-right font-mono">{fmt(report.grandTotal.accumDeprCF)}</td>
            <td className="px-4 py-3 text-right font-mono">{fmt(report.grandTotal.nbv)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// 🌟 [asset_report] ตาราง "ข้อมูลทะเบียนทรัพย์สิน" แบบเต็มตาม template ต้นฉบับ 14 คอลัมน์
// คอลัมน์รหัสทรัพย์สินถูกตรึงไว้ด้านซ้าย (sticky) เพราะตารางกว้างเกินจอ ต้องเลื่อนแนวนอน
// ถ้าไม่ตรึงไว้จะไล่ดูตัวเลขแล้วไม่รู้ว่าเป็นของทรัพย์สินชิ้นไหน
function DetailSheet({ report, onSelectRow }: { report: ReportData; onSelectRow: (row: DetailRow) => void }) {
  // 🌟 [paging] แบ่งหน้าตารางรายละเอียด — รายงานอาจมีหลายร้อยรายการ
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // เปลี่ยนรายงาน (เลือกบริษัท/ปีใหม่) ต้องกลับหน้าแรก ไม่งั้นค้างอยู่หน้าที่ไม่มีข้อมูล
  useEffect(() => { setPage(1); }, [report]);

  if (report.detail.length === 0) {
    return <div className="p-10 text-center text-slate-400 font-semibold">ไม่พบทรัพย์สินในเงื่อนไขที่เลือก</div>;
  }

  // 🌟 [readability] ขยายเท่าแท็บสรุป ให้สลับแท็บแล้วขนาดตัวอักษรไม่กระโดด
  const thBase = 'px-3 py-3 font-black tracking-wide text-sm align-bottom';
  const tdBase = 'px-3 py-3';

  const totalItems = report.detail.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pagedDetail = report.detail.slice(startIndex, startIndex + pageSize);

  return (
    <>
    {/* ตรึงหัวตารางไว้ด้านบนเวลาเลื่อนดู (ต้องกำหนดความสูงให้กล่องก่อน sticky ถึงจะทำงาน) */}
    <div className="max-h-[60vh] overflow-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-30 bg-slate-100 text-slate-600 shadow-[0_1px_0_0_rgb(226,232,240)]">
          <tr>
            <th className={`${thBase} sticky left-0 z-40 bg-slate-100`}>รหัสทรัพย์สิน</th>
            <th className={thBase}>ประเภททรัพย์สิน</th>
            <th className={thBase}>รหัสบัญชี</th>
            <th className={thBase}>ชื่อบัญชี</th>
            <th className={thBase}>รายละเอียดทรัพย์สิน</th>
            <th className={`${thBase} text-right`}>อัตราค่าเสื่อม<br />ราคาต่อปี</th>
            <th className={`${thBase} text-center`}>วันที่ซื้อ</th>
            <th className={`${thBase} text-center`}>วันที่สิ้นสุดอายุ</th>
            <th className={`${thBase} text-right`}>อายุการใช้งาน<br />ทั้งหมด (วัน)</th>
            <th className={`${thBase} text-right`}>อายุการใช้งาน<br />ที่ผ่านมา (วัน)</th>
            <th className={thBase}>ประเภทการคำนวณ<br />ค่าเสื่อมราคา</th>
            <th className={`${thBase} text-right`}>ราคาทุน</th>
            <th className={`${thBase} text-right`}>ค่าเสื่อม<br />สะสมยกมา</th>
            <th className={`${thBase} text-right`}>ค่าเสื่อมราคา</th>
            <th className={`${thBase} text-right`}>ค่าเสื่อม<br />สะสมยกไป</th>
            <th className={`${thBase} text-right`}>มูลค่าตาม<br />บัญชียกไป</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pagedDetail.map((row) => (
            <tr key={row.assetCode} onClick={() => onSelectRow(row)} className="group hover:bg-blue-50/50 transition cursor-pointer text-slate-700">
              <td className={`${tdBase} sticky left-0 z-10 bg-white font-mono font-bold group-hover:bg-blue-50/50`}>
                <div className="flex items-center gap-2">
                  {row.assetCode}
                  {row.isExpired && (
                    <span className="rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                      หมดอายุ
                    </span>
                  )}
                </div>
              </td>
              <td className={`${tdBase} text-slate-600`}>{row.category}</td>
              {/* 🌟 [account_col] รหัสบัญชีใช้ font-mono ให้หลักตรงกัน อ่านผังบัญชีง่าย */}
              <td className={`${tdBase} font-mono text-slate-600`}>{row.accountCode ?? <span className="text-slate-300">-</span>}</td>
              <td className={`${tdBase} text-slate-600`}>{row.accountName ?? <span className="text-slate-300">-</span>}</td>
              <td className={`${tdBase} font-semibold`}>
                {row.description}
                {row.location && <span className="ml-1 text-xs font-normal text-slate-400">({row.location})</span>}
              </td>
              <td className={`${tdBase} text-right font-mono`}>{formatRateWithYears(row.depreciationRate, row.totalUsefulLifeDays)}</td>
              <td className={`${tdBase} text-center font-mono text-slate-600`}>{formatDate(row.purchaseDate)}</td>
              <td className={`${tdBase} text-center font-mono text-slate-600`}>{formatDate(row.endOfLifeDate)}</td>
              <td className={`${tdBase} text-right font-mono`}>{row.totalUsefulLifeDays.toLocaleString()}</td>
              <td className={`${tdBase} text-right font-mono`}>{row.daysUsedTotal.toLocaleString()}</td>
              <td className={`${tdBase} text-slate-500`}>
                <span className="font-semibold text-slate-600">{row.calcType}</span>
                <span className="block text-[11px] text-slate-400">{row.calcCondition}</span>
              </td>
              <td className={`${tdBase} text-right font-mono`}>{fmt(row.cost)}</td>
              <td className={`${tdBase} text-right font-mono`}>{fmt(row.accumDeprBF)}</td>
              <td className={`${tdBase} text-right font-mono`}>{fmt(row.depreciationCurrentPeriod)}</td>
              <td className={`${tdBase} text-right font-mono`}>{fmt(row.accumDeprCF)}</td>
              <td className={`${tdBase} text-right font-mono font-bold`}>{fmt(row.nbv)}</td>
            </tr>
          ))}

          {/* แถวรวมทั้งหมด — เป็นยอดของ "ทุกรายการ" ไม่ใช่เฉพาะหน้านี้
              ใช้ยอดเดียวกับ Grand Total ของ sheet สรุป จะได้ตรวจทานข้ามกันได้ */}
          <tr className="bg-slate-800 font-black text-white">
            <td className={`${tdBase} sticky left-0 z-10 bg-slate-800`}>รวมทั้งหมด</td>
            {/* colSpan ต้องขยับตามจำนวนคอลัมน์ที่แทรกเพิ่ม ไม่งั้นตารางเบี้ยวทั้งแถว */}
            <td className={tdBase} colSpan={10}>{report.detail.length.toLocaleString()} รายการ</td>
            <td className={`${tdBase} text-right font-mono`}>{fmt(report.grandTotal.cost)}</td>
            <td className={`${tdBase} text-right font-mono`}>{fmt(report.grandTotal.accumDeprBF)}</td>
            <td className={`${tdBase} text-right font-mono`}>{fmt(report.grandTotal.depreciationCurrentPeriod)}</td>
            <td className={`${tdBase} text-right font-mono`}>{fmt(report.grandTotal.accumDeprCF)}</td>
            <td className={`${tdBase} text-right font-mono`}>{fmt(report.grandTotal.nbv)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    {/* 🌟 [paging] แถบแบ่งหน้าของตารางรายละเอียด */}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span>
          แสดง <span className="font-bold text-slate-700">{startIndex + 1}–{Math.min(startIndex + pageSize, totalItems)}</span>
          {' '}จาก <span className="font-bold text-slate-700">{totalItems.toLocaleString()}</span> รายการ
        </span>
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 outline-none focus:border-blue-500"
        >
          {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} ต่อหน้า</option>)}
        </select>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={safePage === 1}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" title="หน้าแรก">«</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">ก่อนหน้า</button>
          <span className="px-3 text-sm font-bold text-slate-700">{safePage} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">ถัดไป</button>
          <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" title="หน้าสุดท้าย">»</button>
        </div>
      )}
    </div>
    </>
  );
}

function RowDetailModal({ row, onClose }: { row: DetailRow; onClose: () => void }) {
  const fields: [string, string][] = [
    ['รหัสทรัพย์สิน', row.assetCode],
    ['ประเภททรัพย์สิน', row.category],
    ['ประเภทบัญชี', row.accountCode ? `${row.accountCode} ${row.accountName ?? ''}`.trim() : '-'],
    ['รายละเอียดทรัพย์สิน', row.description],
    ['ที่ตั้งทรัพย์สิน', row.location || '-'],
    ['บริษัท', row.companyName],
    ['อัตราค่าเสื่อมราคาต่อปี', formatRateWithYears(row.depreciationRate, row.totalUsefulLifeDays)],
    ['วันที่ซื้อ', formatDate(row.purchaseDate)],
    ['วันที่สิ้นสุดอายุ', formatDate(row.endOfLifeDate)],
    ['อายุการใช้งานทั้งหมด (วัน)', row.totalUsefulLifeDays.toLocaleString()],
    ['อายุการใช้งานที่ผ่านมา (วัน)', row.daysUsedTotal.toLocaleString()],
    ['ประเภทการคำนวณค่าเสื่อมราคา', row.calcType],
    ['เงื่อนไข', row.calcCondition],
    ['ราคาทุน', fmt(row.cost)],
    ['ค่าเสื่อมสะสมยกมา', fmt(row.accumDeprBF)],
    ['ค่าเสื่อมราคา', fmt(row.depreciationCurrentPeriod)],
    ['ค่าเสื่อมสะสมยกไป', fmt(row.accumDeprCF)],
    ['มูลค่าตามบัญชียกไป', fmt(row.nbv)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 text-white bg-blue-600">
          <h3 className="text-lg font-bold">รายละเอียดทรัพย์สิน — {row.assetCode}</h3>
          <button onClick={onClose} className="rounded-full p-1 bg-white/20 hover:bg-white/40 transition"><BiX className="text-2xl" /></button>
        </div>
        <div className="p-6 space-y-2 bg-slate-50">
          {row.isExpired && (
            <div className="mb-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 text-center">
              ⚠️ ทรัพย์สินนี้หมดอายุแล้ว (ค่าเสื่อมสะสมเต็มจำนวน)
            </div>
          )}
          {fields.map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-slate-100 py-2 text-sm">
              <span className="font-bold text-slate-500">{label}</span>
              <span className="font-semibold text-slate-800 text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
