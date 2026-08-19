// src/app/asset/(main)/register/page.tsx
// 🌟 [asset_portal] ทะเบียนทรัพย์สิน สำหรับ role ASSET (ธีม Employee)
// ใช้ component กลางตัวเดียวกับฝั่ง /admin/assets
import AssetRegisterView from '@/components/assets/AssetRegisterView';

export default function AssetRegisterPortalPage() {
  return <AssetRegisterView />;
}
