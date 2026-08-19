// src/app/asset/(main)/layout.tsx
// 🌟 [asset_portal] โซนสำหรับ user ที่มี role ASSET — ใช้ธีมเดียวกับฝั่ง Employee (โทนสว่าง เรียบง่าย)
// ไม่ใช่ธีม Admin เพราะ user กลุ่มนี้ไม่ใช่ผู้ดูแลระบบ แค่ทำงานกับทะเบียนทรัพย์สินอย่างเดียว
'use client';

import AutoLogout from '@/components/AutoLogout';
import LogoutButton from '@/components/LogoutButton';
import UserProfileHeader from '@/components/UserProfileHeader';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { BiPackage, BiBarChartAlt2 } from 'react-icons/bi';
import { ReactNode } from 'react';

const MENU_ITEMS = [
  { name: 'Asset Register', path: '/asset/register', icon: BiPackage },
  { name: 'Asset Report', path: '/asset/report', icon: BiBarChartAlt2 },
];

export default function AssetPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  // 🌟 แสดงว่าใครกำลังใช้งานอยู่ (ดึงจาก session — เผื่อ name ว่างให้ fallback ไป username)
  const displayName =
    session?.user?.name || (session?.user as any)?.username || 'ผู้ใช้งาน';
  const userRole = (session?.user as any)?.role || '';

  return (
    <div className="flex min-h-screen bg-[#f4f7f6] font-sans text-slate-700">
      <AutoLogout timeoutSeconds={600} redirectUrl="/employee/login" />

      <aside className="hidden w-64 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="border-b border-gray-100 p-6">
          <div className="font-bold tracking-tight text-blue-600">ASSET HUB</div>

          {/* 🌟 ข้อมูลผู้ใช้งานที่ล็อกอินอยู่ */}
          <div className="mt-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-black uppercase text-blue-600">
              {displayName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-700" title={displayName}>
                {displayName}
              </p>
              {userRole && (
                <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">
                  {userRole}
                </span>
              )}
            </div>
          </div>
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

      <main className="flex-1 p-6 md:p-10">
        {/* 🌟 การ์ดโปรไฟล์ผู้ใช้งาน — ธีมเดียวกับหน้า My Payslips ฝั่งพนักงาน */}
        <div className="mx-auto max-w-7xl">
          <UserProfileHeader />
        </div>
        {children}
      </main>
    </div>
  );
}
