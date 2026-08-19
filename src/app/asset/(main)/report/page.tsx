// src/app/asset/(main)/report/page.tsx
// 🌟 [asset_portal] รายงานทรัพย์สิน สำหรับ role ASSET (ธีม Employee)
// ใช้ component กลางตัวเดียวกับฝั่ง /admin/assets-report
import AssetReportView from '@/components/assets/AssetReportView';

export default function AssetReportPortalPage() {
  return <AssetReportView />;
}
