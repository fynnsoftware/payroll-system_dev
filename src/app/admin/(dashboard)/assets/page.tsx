// src/app/admin/(dashboard)/assets/page.tsx
// 🌟 ฝั่ง Admin — ใช้ component กลางเดียวกับ /asset/register (ธีม Employee)
// เนื้อหน้าจริงอยู่ที่ src/components/assets/AssetRegisterView.tsx
import AssetRegisterView from '@/components/assets/AssetRegisterView';

export default function AssetRegisterPage() {
  return <AssetRegisterView />;
}
