// src/app/admin/(dashboard)/assets-report/page.tsx
// 🌟 ฝั่ง Admin — ใช้ component กลางเดียวกับ /asset/report (ธีม Employee)
// เนื้อหน้าจริงอยู่ที่ src/components/assets/AssetReportView.tsx
import AssetReportView from '@/components/assets/AssetReportView';

export default function AssetReportPage() {
  return <AssetReportView />;
}
