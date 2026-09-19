// src/app/api/assets/check-code/route.ts
// 🌟 [dup_warn] ตรวจว่ารหัสทรัพย์สินที่กำลังจะกรอก ซ้ำกับของเดิมหรือไม่ — เตือนตั้งแต่ตอนพิมพ์
//
// 🌟 [group_dup] ขอบเขตความซ้ำ = "เครือบริษัท" เท่านั้น
//   ซ้ำในบริษัทเดียวกัน      -> เตือนแดง (มักแปลว่ากำลังสร้างทรัพย์สินตัวเดิมซ้ำ)
//   ซ้ำกับบริษัทในเครือ      -> เตือนเหลือง (คนละบริษัทแต่ทะเบียนเดียวกัน บันทึกไม่ได้)
//   ซ้ำกับบริษัทนอกเครือ     -> ไม่ถือว่าซ้ำ ไม่ต้องเตือน เป็นคนละทะเบียนกันคนละชุด
//
// ⚠️ ทำไมต้องมีเส้นนี้ ทั้งที่ DB มี unique อยู่แล้ว:
// ตอนกดบันทึก POST /api/assets จะ "ข้ามรหัสที่ถูกใช้ไปแล้วให้เงียบๆ" (generateAssetCodes)
// ผู้ใช้กรอก C-20260906-0001 แต่ถ้าซ้ำ ระบบบันทึกเป็น C-20260906-0002 โดยไม่บอก
// คนกรอกจึงเชื่อว่าได้รหัสตามที่พิมพ์ แล้วไปเขียนป้ายทรัพย์สิน/เอกสารผิดตัว
// เส้นนี้บอกล่วงหน้าว่าซ้ำ ซ้ำกับของใคร และถ้ายังกดบันทึกจะได้รหัสอะไรจริงๆ
import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/apiGuard";
import { getAssetCompanyIds, isAssetCompanyAllowed } from "@/lib/assetScope";
import { parseAssetCode, generateAssetCodes } from "@/lib/assetCode";
import { getGroupRootId, findGroupAssetsByCodePrefix } from "@/lib/companyGroup";

/** ความซ้ำอยู่ตรงไหน — ใช้เลือกระดับความแรงของคำเตือนฝั่งหน้าจอ */
export type ConflictScope =
  | "SAME_COMPANY" // ซ้ำในบริษัทเดียวกัน
  | "GROUP"; // ซ้ำกับบริษัทอื่นในเครือเดียวกัน
// หมายเหตุ: ไม่มี "OTHER" แล้ว — นอกเครือถือว่าไม่ซ้ำ จึงคืน taken:false ไปเลย

const MAX_QTY_CHECK = 50; // กันคนยิง qty มหาศาลมาให้ server ไล่รันเลข

export async function GET(request: NextRequest) {
  try {
    const { denied, token } = await guard(request);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const code = (searchParams.get("code") || "").trim();
    const companyId = Number(searchParams.get("companyId"));
    const qty = Math.min(Math.max(Number(searchParams.get("qty")) || 1, 1), MAX_QTY_CHECK);
    // โหมดแก้ไข: ทรัพย์สินตัวเองไม่นับว่าชนกับตัวเอง (Asset.id เป็นสตริง ไม่ใช่ตัวเลข)
    const excludeId = (searchParams.get("excludeId") || "").trim() || null;

    if (!code || !Number.isInteger(companyId)) {
      return NextResponse.json({ taken: false, scope: null, conflict: null, suggestedCodes: [] });
    }

    const allowed = await getAssetCompanyIds(token);
    if (!isAssetCompanyAllowed(allowed, companyId)) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" }, { status: 403 });
    }

    const groupRootId = await getGroupRootId(companyId);

    // ── รหัสจริงที่ระบบจะให้ ถ้ายังกดบันทึกต่อ ─────────────────────
    // จำลองตรรกะเดียวกับ POST /api/assets เป๊ะๆ เพื่อให้สิ่งที่เตือนตรงกับสิ่งที่จะเกิดขึ้นจริง
    const parsed = parseAssetCode(code);
    const takenInGroup = await findGroupAssetsByCodePrefix(groupRootId, parsed.prefix, excludeId);
    const suggestedCodes = generateAssetCodes(code, qty, new Set(takenInGroup));

    // ── หารหัสที่ชน (เฉพาะในเครือ) ────────────────────────────────
    // ⚠️ ห้ามใช้ findUnique({ assetCode }) แล้ว — รหัสเดียวกันมีได้หลายแถวถ้าคนละเครือ
    const hit = await prisma.asset.findFirst({
      where: {
        groupRootId,
        assetCode: code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        assetCode: true,
        description: true,
        companyId: true,
        company: { select: { companyName: true } },
      },
    });

    if (!hit) {
      // นอกเครือจะใช้รหัสนี้อยู่หรือไม่ก็ไม่เกี่ยวกับเรา — ถือว่าว่าง
      return NextResponse.json({ taken: false, scope: null, conflict: null, suggestedCodes });
    }

    const scope: ConflictScope = hit.companyId === companyId ? "SAME_COMPANY" : "GROUP";

    // 🔒 ยังคงกรองอีกชั้น เผื่อบริษัทในเครือที่ผู้ใช้ไม่ได้เป็นสมาชิก
    // (สมาชิกภาพฝั่ง asset ให้ทีละบริษัท ไม่ได้ให้ยกเครือ — ดู assetScope.ts)
    const canSeeDetail = isAssetCompanyAllowed(allowed, hit.companyId);

    return NextResponse.json({
      taken: true,
      scope,
      conflict: canSeeDetail
        ? {
            assetCode: hit.assetCode,
            description: hit.description,
            companyName: hit.company?.companyName ?? null,
          }
        : null,
      suggestedCodes,
    });
  } catch (error) {
    console.error("GET check asset code Error:", error);
    return NextResponse.json({ error: "ตรวจสอบรหัสไม่สำเร็จ" }, { status: 500 });
  }
}
