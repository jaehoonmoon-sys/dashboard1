import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

export async function POST(req: NextRequest) {
  const { page_path, session_id } = await req.json();
  const is_admin = req.cookies.get("is_admin")?.value === "true";

  // 관리자 접속은 로그 기록 안 함
  if (!is_admin) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      "";
    await supabase.from("dm5_access_logs").insert({ page_path, session_id, ip });
  }

  return NextResponse.json({ ok: true });
}
