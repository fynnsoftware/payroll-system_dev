'use client';

// src/components/UserProfileHeader.tsx
// 🌟 การ์ดโปรไฟล์ผู้ใช้งานสำหรับหน้าจอฝั่ง user (ธีมเดียวกับหน้า My Payslips)
// ใช้ในโซน /asset เพื่อให้รู้ว่ากำลังใช้งานด้วยบัญชีไหน สังกัดบริษัทอะไร
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';

interface AssetCompanyBrief {
  id: number;
  companyName: string;
  logoUrl: string | null;
  isOwner: boolean;
}

interface MeResponse {
  profile: {
    id: string;
    fullName: string;
    position: string | null;
    department: string | null;
    startDate: string | null;
    company?: { companyName: string; logoUrl: string | null } | null;
  } | null;
  username: string | null;
  role: string | null;
  // 🌟 [asset_redesign] บริษัทที่เข้าถึงได้ในโมดูล Asset (บัญชีฝั่ง Asset ไม่มี Employee ผูก)
  assetCompanies?: AssetCompanyBrief[];
}

export default function UserProfileHeader() {
  const { data: session, status } = useSession();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data))
      .catch(() => setMe(null));
  }, [status]);

  const profile = me?.profile;
  const assetCompanies = me?.assetCompanies ?? [];

  // ชื่อที่แสดง: ชื่อเต็มจาก employee -> ชื่อใน session -> username
  const displayName =
    profile?.fullName || session?.user?.name || me?.username || 'Loading...';

  // 🌟 บัญชีฝั่ง Asset ไม่มี Employee จึงไม่มีรหัสพนักงาน ให้แสดง username แทน
  const idLabel = profile ? 'EMP ID' : 'บัญชีผู้ใช้';
  const displayEmpId =
    profile?.id || me?.username || (session?.user as any)?.employeeId || '-';

  // 🌟 [asset_ui] ผู้ใช้ที่เข้ามาด้วย role ASSET ไม่ต้องแสดง "Position"
  //
  // เหตุผล: Position เป็นข้อมูลของฝั่ง HR/Payroll (ตำแหน่งงานในบริษัท) ซึ่งบัญชีฝั่ง Asset
  // ส่วนใหญ่ไม่มี Employee ผูกอยู่ ถ้ามีก็มักถูกกรอกมั่วๆ ไว้ตอนสร้างบัญชี เช่น "asset"
  // แสดงออกไปแล้วผู้ใช้จะเข้าใจผิดว่าเป็นข้อมูลที่ระบบใช้งานจริง
  // -> โชว์สิทธิ์การใช้งานแทน ซึ่งเป็นข้อมูลที่ตรงกับบริบทของโซนนี้
  const currentRole = me?.role || (session?.user as any)?.role || '';
  const ROLE_LABELS: Record<string, string> = {
    ADMIN: 'ผู้ดูแลระบบ',
    ASSET: 'ระบบทะเบียนทรัพย์สิน',
    HR: 'ฝ่ายบุคคล',
    USER: 'พนักงาน',
  };
  const badgeText =
    currentRole === 'ASSET' || !profile?.position
      ? `สิทธิ์: ${ROLE_LABELS[currentRole] || currentRole || '-'}`
      : `Position: ${profile.position}`;

  // บริษัทที่จะแสดง: ของ employee ก่อน ถ้าไม่มีใช้บริษัทแรกที่เป็นสมาชิกในโมดูล Asset
  const companyName =
    profile?.company?.companyName ||
    (assetCompanies.length > 0 ? assetCompanies[0].companyName : null);

  const rawLogo = profile?.company?.logoUrl || assetCompanies[0]?.logoUrl || null;
  const logoUrl = rawLogo ? decodeURIComponent(rawLogo) : '/src/logoFynnSoft.jpg';

  return (
    <div className="mb-8 flex items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white shadow-lg relative">
      {/* รูปพื้นหลังตกแต่ง (ชุดเดียวกับหน้า My Payslips) */}
      <div className="absolute -right-20 -top-20 opacity-10">
        <svg width="300" height="300" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <path
            fill="#FFFFFF"
            d="M42.7,-73.4C55.9,-67.5,67.6,-57.4,76.5,-45.3C85.4,-33.2,91.5,-19.1,91.8,-4.9C92.2,9.3,86.8,23.5,78.2,35.6C69.6,47.7,57.8,57.7,44.9,64.8C32,71.9,18,76.1,3.4,70.6C-11.2,65.1,-25.2,49.9,-37.8,40.8C-50.4,31.7,-61.6,28.7,-70.5,19.3C-79.4,9.9,-86,-5.9,-84.1,-21C-82.2,-36.1,-71.8,-50.5,-58.5,-57.2C-45.2,-63.9,-29.1,-62.9,-14.8,-69C-0.5,-75.1,14,-88.3,28.3,-84.3C42.6,-80.3,56.8,-69,42.7,-73.4Z"
            transform="translate(100 100) scale(1.1)"
          />
        </svg>
      </div>

      <div className="relative z-10 flex items-center">
        <div className="mr-6 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-blue-400 bg-white p-1 shadow-sm">
          <Image
            src={logoUrl}
            alt="Company Logo"
            width={96}
            height={96}
            className="h-full w-full object-contain"
          />
        </div>
        <div>
          <h3 className="mb-1 text-2xl font-bold">{displayName}</h3>
          <p className="mb-2 text-blue-100">
            {idLabel}: <span className="font-bold">{displayEmpId}</span>
            {profile?.department ? ` | ${profile.department}` : ''}
          </p>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-600">
            {badgeText}
          </span>
        </div>
      </div>

      <div className="relative z-10 hidden text-right lg:block">
        <p className="mb-1 text-sm text-blue-100">
          {assetCompanies.length > 1 ? 'บริษัทที่ดูแล' : 'Company'}
        </p>
        <h5 className="text-xl font-bold">{companyName || '-'}</h5>
        {assetCompanies.length > 1 && (
          <p className="mt-1 text-sm text-blue-100">
            และอีก {assetCompanies.length - 1} บริษัท
          </p>
        )}
      </div>
    </div>
  );
}
