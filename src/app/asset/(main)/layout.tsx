// src/app/asset/(main)/layout.tsx
// 🌟 [asset_portal] โซนสำหรับ user ที่มี role ASSET — ใช้ธีมเดียวกับฝั่ง Employee (โทนสว่าง เรียบง่าย)
// ไม่ใช่ธีม Admin เพราะ user กลุ่มนี้ไม่ใช่ผู้ดูแลระบบ แค่ทำงานกับทะเบียนทรัพย์สินอย่างเดียว
'use client';

import AutoLogout from '@/components/AutoLogout';
import LogoutButton from '@/components/LogoutButton';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BiPackage, BiBarChartAlt2 } from 'react-icons/bi';
import { ReactNode } from 'react';

const MENU_ITEMS = [
  { name: 'Asset Register', path: '/asset/register', icon: BiPackage },
  { name: 'Asset Report', path: '/asset/report', icon: BiBarChartAlt2 },
];

export default function AssetPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[#f4f7f6] font-sans text-slate-700">
      <AutoLogout timeoutSeconds={600} redirectUrl="/employee/login" />

      <aside className="hidden w-64 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="border-b border-gray-100 p-6 font-bold tracking-tight text-blue-600">
          ASSET HUB
        </div>

        <div className="flex flex-col py-4">
          {MENU_ITEMS.map((menu) => {
            const Icon = menu.icon;
            const isActive = pathname === menu.path;
            return (
              <Link
                key={menu.path}
                href={menu.path}
                className={
                  isActive
                    ? 'flex items-center rounded-r-full bg-blue-50 px-6 py-3 font-medium text-blue-600'
                    : 'flex items-center px-6 py-3 font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-blue-600'
                }
              >
                <Icon className="mr-3 text-lg" /> {menu.name}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col border-t border-gray-100 py-4">
          <LogoutButton redirectUrl="/employee/login" />
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
