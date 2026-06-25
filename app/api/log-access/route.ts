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
    await supabase.from("mj_access_logs").insert({ page_path, session_id });
  }

  return NextResponse.json({ ok: true });
}
