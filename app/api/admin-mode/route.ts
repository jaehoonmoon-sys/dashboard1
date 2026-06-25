import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, message: "비밀번호가 틀렸습니다." }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "";

  await supabase.from("mj_access_logs").insert({
    page_path: "/admin",
    session_id: "",
    ip,
    is_admin: true,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("is_admin", "true", {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("is_admin");
  return res;
}
