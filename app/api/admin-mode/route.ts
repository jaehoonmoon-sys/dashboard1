import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, message: "비밀번호가 틀렸습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("is_admin", "true", {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일
    sameSite: "lax",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("is_admin");
  return res;
}
