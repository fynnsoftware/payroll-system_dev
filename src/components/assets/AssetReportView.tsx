'use client';

// src/components/assets/AssetReportView.tsx
// 🌟 [Phase 2 - Asset task #20, #21, #22] หน้าจอแสดงรายการทรัพย์สิน + Report 2 sheet (สรุป / รายละเอียด)
// ⚠️ component กลาง ใช้ร่วมกันทั้งฝั่ง /admin/assets-report (ธีม Admin) และ /asset/report (ธีม Employee)
// แก้ที่นี่ที่เดียวมีผลทั้งสองฝั่ง — อย่า copy ไปวางซ้ำ
import React, { useState, useEffect } from 'react';
import { BiBarChartAlt2, BiRefresh, BiBuilding, BiX, BiListUl, BiTable, BiSpreadsheet } from 'react-icons/bi';
import { ToastProvider, useToast } from '@/components/Toast';
import { formatDate } from '@/lib/formatDate';
import { formatRateWithYears } from '@/lib/depreciation';
import { exportAssetReport } from '@/lib/assetReportExport';

// 🌟 [asset_hierarchy] ทะเบียนบริษัทฝั่ง asset รองรับโครงสร้างแม่-ลูก 2 ชั้นแล้ว
interface CompanyOption { id: number; companyName: string; companyCode: string; parentId?: number | null; }

interface DetailRow {
  assetCode: string;
  category: string;
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

interface SummaryGroup {
  category: string;
  items: DetailRow[];
  subtotal: { cost: number; accumDeprBF: number; depreciationCurrentPeriod: number; accumDeprCF: number; nbv: number };
}

interface ReportData {
  companyName: string;
  periodEndDate: string;
  periodStartDate: string;
  summary: SummaryGroup[];
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
  const [year, setYear] = useState(new Date().getFullYear());
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

  const runReport = async () => {
    if (!companyId) { showToast('กรุณาเลือกบริษัทก่อน', 'error'); return; }
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ companyId, includeSubCompanies: String(includeSub), year: String(year) });
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
      const fileName = exportAssetReport(report, target, year);
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
            {tab === 'SUMMARY' ? <SummarySheet report={report} /> : <DetailSheet report={report} onSelectRow={setSelectedRow} />}
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
function SummarySheet({ report }: { report: ReportData }) {
  const thBase = 'px-4 py-3 font-black uppercase tracking-wider text-[11px]';
  const dimCols = 4; // จำนวนคอลัมน์ที่ไม่ใช่ตัวเลข (ประเภท/รหัส/รายละเอียด/อัตรา)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
          <tr>
            <th className="border-b border-slate-200" colSpan={dimCols} />
            <th
              className="border-b border-l border-slate-300 bg-slate-200/70 px-4 py-2 text-center text-[11px] font-black uppercase tracking-widest text-slate-600"
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
          {report.summary.map((g) => (
            <React.Fragment key={g.category}>
              {g.items.map((row, i) => (
                <tr key={row.assetCode} className="hover:bg-blue-50/50 transition text-slate-600">
                  {/* แสดงชื่อประเภทเฉพาะแถวแรกของกลุ่ม เหมือน pivot ที่ไม่พิมพ์ค่าซ้ำ */}
                  <td className="px-4 py-2 font-semibold text-slate-700">
                    {i === 0 ? g.category : ''}
                  </td>
                  <td className="px-4 py-2 font-mono">{row.assetCode}</td>
                  <td className="px-4 py-2">{row.description}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatRateWithYears(row.depreciationRate, row.totalUsefulLifeDays)}</td>
                  <td className="px-4 py-2 border-l border-slate-200 text-right font-mono">{fmt(row.cost)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(row.accumDeprBF)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(row.depreciationCurrentPeriod)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(row.accumDeprCF)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(row.nbv)}</td>
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

  const thBase = 'px-3 py-3 font-black uppercase tracking-wider text-[11px] align-bottom';
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
            <td className={tdBase} colSpan={8}>{report.detail.length.toLocaleString()} รายการ</td>
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
