// src/app/admin/(dashboard)/layout.tsx
'use client'; // ต้องเพิ่มคำนี้เพราะเราจะใช้ usePathname

import { useSession } from "next-auth/react";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
// 🌟 1. นำเข้า BiHistory สำหรับเมนู Import Log
import { BiBuilding, BiGroup, BiImport, BiWallet, BiHistory, BiPackage, BiBarChartAlt2, BiCog } from 'react-icons/bi';
import AutoLogout from '@/components/AutoLogout';
import LogoutButton from '@/components/LogoutButton';
import { ReactNode, useEffect, useState } from 'react';

// 🌟 [RBAC] moduleCode ผูกกับ Module.code ในฐานข้อมูล (HR / ASSET) ใช้ทั้งจัดกลุ่ม sidebar และเช็คสิทธิ์
const MENU_ITEMS = [
  { name: "Company Mgt.", path: "/admin/company", icon: BiBuilding, allowedRoles: ["ADMIN", "HR"], moduleCode: "HR" },
  { name: "People Mgt.", path: "/admin/people", icon: BiGroup, allowedRoles: ["ADMIN", "HR"], moduleCode: "HR" },
  { name: "Import Salary", path: "/admin/import", icon: BiImport, allowedRoles: ["ADMIN", "HR"], moduleCode: "HR" },
  { name: "Import Log", path: "/admin/import-log", icon: BiHistory, allowedRoles: ["ADMIN"], moduleCode: "HR" },
  { name: "Salary Summary", path: "/admin/summary", icon: BiWallet, allowedRoles: ["ADMIN"], moduleCode: "HR" },
  // 🌟 [Phase 2 - Asset]
  { name: "Asset Register", path: "/admin/assets", icon: BiPackage, allowedRoles: ["ADMIN", "HR", "ASSET"], moduleCode: "ASSET" },
  { name: "Asset Report", path: "/admin/assets-report", icon: BiBarChartAlt2, allowedRoles: ["ADMIN", "HR", "ASSET"], moduleCode: "ASSET" },
  { name: "Settings", path: "/admin/settings", icon: BiCog, allowedRoles: ["ADMIN", "ASSET"], moduleCode: "ASSET" },
];

const MODULE_LABELS: Record<string, string> = { HR: "Payroll", ASSET: "Assessment" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname(); // ดึง URL ปัจจุบันมาตรวจสอบ

  const { data: session } = useSession();
  const userRole = session?.user?.role || "USER";

  // ดึงชื่อผู้ใช้งานมาแสดง (ดักจับทั้งแบบที่เก็บใน name หรือ username)
  const adminName = session?.user?.name || (session?.user as any)?.username || "Admin";

  // 🌟 [RBAC] โหลด access matrix จาก DB — ADMIN ผ่านเสมอไม่ต้องเช็ค matrix
  const [allowedModules, setAllowedModules] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (userRole === "ADMIN") return; // ไม่ต้องเรียก API ให้เปลืองถ้าเป็น ADMIN อยู่แล้ว
    fetch('/api/modules')
      .then(res => res.ok ? res.json() : { accessMatrix: [] })
      .then(data => {
        const mods = new Set<string>(
          (data.accessMatrix || [])
            .filter((a: any) => a.role === userRole)
            .map((a: any) => a.moduleCode),
        );
        setAllowedModules(mods);
      })
      .catch(() => setAllowedModules(new Set()));
  }, [userRole]);

  // ฟังก์ชันเช็กว่าหน้านี้คือหน้าปัจจุบันไหม เพื่อสลับสีคลาส
  const getNavClass = (path: string) => {
    const isActive = pathname === path;
    return isActive
      ? "flex items-center bg-blue-600 px-6 py-4 font-semibold text-white transition-colors"
      : "flex items-center px-6 py-4 font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-blue-600";
  };

  const isModuleAllowed = (moduleCode: string) => {
    if (userRole === "ADMIN") return true;
    if (allowedModules === null) return false; // ยังโหลดไม่เสร็จ กันเมนูกระพริบขึ้นมาก่อนสิทธิ์จริง
    return allowedModules.has(moduleCode);
  };

  const visibleItems = MENU_ITEMS.filter(
    (menu) => menu.allowedRoles.includes(userRole) && isModuleAllowed(menu.moduleCode),
  );

  // จัดกลุ่มตาม moduleCode แบบคงลำดับเดิมของ MENU_ITEMS
  const groupedItems: { moduleCode: string; items: typeof visibleItems }[] = [];
  for (const item of visibleItems) {
    let group = groupedItems.find((g) => g.moduleCode === item.moduleCode);
    if (!group) {
      group = { moduleCode: item.moduleCode, items: [] };
      groupedItems.push(group);
    }
    group.items.push(item);
  }

  return (
    <div className="flex min-h-screen bg-[#f4f7f6] font-sans text-slate-700">
      {/* 🌟 1. ตัวจับเวลาเบื้องหลัง (ซ่อนอยู่) */}
      <AutoLogout timeoutSeconds={600} redirectUrl="/admin/login" />

      <aside className="hidden w-64 flex-col border-r border-gray-200 bg-white shadow-sm md:flex">

        {/* 🌟 2. ปรับแต่งส่วน Header ของ Sidebar เพิ่มคำว่า Hi {adminName} ตรงนี้ครับ */}
        <div className="border-b border-gray-100 p-6">
          <div className="text-xl font-black tracking-tight text-blue-600">
            Fynnsoft
          </div>
          <div className="mt-2 flex items-center text-sm font-medium text-slate-500">
            <span className="mr-1.5 text-lg">👋</span> Hi, <span className="ml-1 font-bold text-slate-700">{adminName}</span>
          </div>
        </div>

        {/* 🌟 เมนูต่างๆ จัดกลุ่มเป็น module (HR / Assetment) */}
        <div className="flex flex-1 flex-col py-2 overflow-y-auto">
          {groupedItems.map((group) => (
            <div key={group.moduleCode} className="mb-1">
              <div className="px-6 pt-4 pb-1 text-[11px] font-black uppercase tracking-wider text-slate-400">
                {MODULE_LABELS[group.moduleCode] || group.moduleCode}
              </div>
              {group.items.map((menu) => {
                const Icon = menu.icon;
                return (
                  <Link key={menu.path} href={menu.path} className={getNavClass(menu.path)}>
                    <Icon className="mr-3 text-xl" /> {menu.name}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* 🌟 3. ปุ่ม Logout จะถูกดันลงมาอยู่ล่างสุดของ Sidebar เสมอ */}
        <div className="flex flex-col py-4 border-t border-gray-100 mt-auto">
          <LogoutButton redirectUrl="/admin/login" />
        </div>

      </aside>

      <main className="flex-1 p-6 md:p-10">
        {children}
      </main>

    </div>
  );
}
