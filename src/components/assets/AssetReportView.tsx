'use client';

// src/components/assets/AssetReportView.tsx
// 🌟 [Phase 2 - Asset task #20, #21, #22] หน้าจอแสดงรายการทรัพย์สิน + Report 2 sheet (สรุป / รายละเอียด)
// ⚠️ component กลาง ใช้ร่วมกันทั้งฝั่ง /admin/assets-report (ธีม Admin) และ /asset/report (ธีม Employee)
// แก้ที่นี่ที่เดียวมีผลทั้งสองฝั่ง — อย่า copy ไปวางซ้ำ
import React, { useState, useEffect } from 'react';
import { BiBarChartAlt2, BiRefresh, BiBuilding, BiX, BiListUl, BiTable } from 'react-icons/bi';
import { ToastProvider, useToast } from '@/components/Toast';

interface CompanyOption { id: number; companyName: string; companyCode: string; parentId: number | null; }

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
    fetch('/api/companies').then(res => res.ok ? res.json() : []).then((data: CompanyOption[]) => {
      setCompanies(data);
      const primary = data.find(c => c.parentId === null);
      if (primary) setCompanyId(String(primary.id));
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

  const primaryCompanies = companies.filter(c => c.parentId === null);

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
            {primaryCompanies.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">รอบปี (Fiscal Year)</label>
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-32 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-blue-50 focus:border-blue-500" />
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600 pb-2.5 cursor-pointer">
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
              <p><span className="font-bold text-slate-500">วันสิ้นงวดบัญชี:</span> <span className="font-black text-slate-800">{new Date(report.periodEndDate).toLocaleDateString('th-TH')}</span></p>
              <p><span className="font-bold text-slate-500">ช่วงงวด:</span> <span className="font-black text-slate-800">{new Date(report.periodStartDate).toLocaleDateString('th-TH')} - {new Date(report.periodEndDate).toLocaleDateString('th-TH')}</span></p>
            </div>
          </div>

          {/* Tabs = 2 sheet */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('SUMMARY')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'SUMMARY' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}><BiListUl /> สรุปทะเบียนทรัพย์สิน</button>
            <button onClick={() => setTab('DETAIL')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'DETAIL' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}><BiTable /> ข้อมูลทะเบียนทรัพย์สิน</button>
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

function SummarySheet({ report }: { report: ReportData }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
          <tr>
            <th className="px-4 py-3 font-black uppercase tracking-wider text-xs">ประเภททรัพย์สิน</th>
            <th className="px-4 py-3 font-black uppercase tracking-wider text-xs text-right">ราคาทุน</th>
            <th className="px-4 py-3 font-black uppercase tracking-wider text-xs text-right">ค่าเสื่อมสะสมยกมา</th>
            <th className="px-4 py-3 font-black uppercase tracking-wider text-xs text-right">ค่าเสื่อมราคา</th>
            <th className="px-4 py-3 font-black uppercase tracking-wider text-xs text-right">ค่าเสื่อมสะสมยกไป</th>
            <th className="px-4 py-3 font-black uppercase tracking-wider text-xs text-right">มูลค่าตามบัญชียกไป</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {report.summary.map((g) => (
            <React.Fragment key={g.category}>
              {g.items.map((row) => (
                <tr key={row.assetCode} className="hover:bg-blue-50/50 transition text-slate-600">
                  <td className="px-4 py-2 pl-8">{g.category} <span className="text-slate-400 font-mono">— {row.assetCode}</span></td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(row.cost)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(row.accumDeprBF)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(row.depreciationCurrentPeriod)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(row.accumDeprCF)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(row.nbv)}</td>
                </tr>
              ))}
              <tr className="bg-amber-50 font-black text-slate-800">
                <td className="px-4 py-2.5">{g.category} Total</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(g.subtotal.cost)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(g.subtotal.accumDeprBF)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(g.subtotal.depreciationCurrentPeriod)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(g.subtotal.accumDeprCF)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(g.subtotal.nbv)}</td>
              </tr>
            </React.Fragment>
          ))}
          <tr className="bg-slate-800 text-white font-black">
            <td className="px-4 py-3">Grand Total</td>
            <td className="px-4 py-3 text-right font-mono">{fmt(report.grandTotal.cost)}</td>
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

function DetailSheet({ report, onSelectRow }: { report: ReportData; onSelectRow: (row: DetailRow) => void }) {
  if (report.detail.length === 0) {
    return <div className="p-10 text-center text-slate-400 font-semibold">ไม่พบทรัพย์สินในเงื่อนไขที่เลือก</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
          <tr>
            <th className="px-4 py-3 font-black uppercase tracking-wider text-xs">รหัสทรัพย์สิน</th>
            <th className="px-4 py-3 font-black uppercase tracking-wider text-xs">รายละเอียด</th>
            <th className="px-4 py-3 font-black uppercase tracking-wider text-xs">ประเภทการคำนวณ</th>
            <th className="px-4 py-3 font-black uppercase tracking-wider text-xs text-center">สถานะ</th>
            <th className="px-4 py-3 font-black uppercase tracking-wider text-xs text-right">มูลค่าตามบัญชียกไป</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {report.detail.map((row) => (
            <tr key={row.assetCode} onClick={() => onSelectRow(row)} className="hover:bg-blue-50/50 transition cursor-pointer text-slate-700">
              <td className="px-4 py-3 font-mono font-bold">{row.assetCode}</td>
              <td className="px-4 py-3 font-semibold">{row.description}</td>
              <td className="px-4 py-3 text-slate-500">
                <span className="font-semibold text-slate-600">{row.calcType}</span>
                <span className="block text-xs text-slate-400">{row.calcCondition}</span>
              </td>
              <td className="px-4 py-3 text-center">
                {row.isExpired && (
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase border bg-red-100 text-red-700 border-red-200">
                    หมดอายุ
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right font-mono font-bold">{fmt(row.nbv)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowDetailModal({ row, onClose }: { row: DetailRow; onClose: () => void }) {
  const fields: [string, string][] = [
    ['รหัสทรัพย์สิน', row.assetCode],
    ['ประเภททรัพย์สิน', row.category],
    ['รายละเอียดทรัพย์สิน', row.description],
    ['ที่ตั้งทรัพย์สิน', row.location || '-'],
    ['บริษัท', row.companyName],
    ['อัตราค่าเสื่อมราคาต่อปี', `${(row.depreciationRate * 100).toFixed(2)}%`],
    ['วันที่ซื้อ', new Date(row.purchaseDate).toLocaleDateString('th-TH')],
    ['วันที่สิ้นสุดอายุ', new Date(row.endOfLifeDate).toLocaleDateString('th-TH')],
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
