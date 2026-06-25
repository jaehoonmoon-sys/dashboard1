"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

type DailyStat = {
  date: string;
  tutor: number;
  admin: number;
};

type PageStat = {
  page_path: string;
  tutor: number;
  admin: number;
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [pages, setPages] = useState<PageStat[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthed(true);
      setError("");
      loadStats();
    } else {
      setError("비밀번호가 틀렸습니다.");
    }
  }

  async function loadStats() {
    setLoading(true);

    const { data } = await supabase
      .from("mj_access_logs")
      .select("accessed_at, page_path, is_admin")
      .order("accessed_at", { ascending: false });

    if (!data) { setLoading(false); return; }

    // 날짜별 집계
    const dailyMap: Record<string, { tutor: number; admin: number }> = {};
    const pageMap: Record<string, { tutor: number; admin: number }> = {};

    for (const row of data) {
      const date = new Date(row.accessed_at).toLocaleDateString("ko-KR", {
        timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      });
      if (!dailyMap[date]) dailyMap[date] = { tutor: 0, admin: 0 };
      if (row.is_admin) dailyMap[date].admin++;
      else dailyMap[date].tutor++;

      const path = row.page_path || "/";
      if (!pageMap[path]) pageMap[path] = { tutor: 0, admin: 0 };
      if (row.is_admin) pageMap[path].admin++;
      else pageMap[path].tutor++;
    }

    setDaily(
      Object.entries(dailyMap)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => b.date.localeCompare(a.date))
    );
    setPages(
      Object.entries(pageMap)
        .map(([page_path, v]) => ({ page_path, ...v }))
        .sort((a, b) => (b.tutor + b.admin) - (a.tutor + a.admin))
    );
    setLoading(false);
  }

  useEffect(() => {
    // 쿠키가 이미 있으면 바로 로드
    fetch("/api/log-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page_path: "/admin", session_id: "" }) });
    document.cookie.split(";").forEach((c) => {
      if (c.trim().startsWith("is_admin=true")) {
        setAuthed(true);
        loadStats();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authed) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#F5F5F5" }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: "40px 48px", boxShadow: "0 2px 16px rgba(0,0,0,0.08)", minWidth: 320 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>관리자 접속</h2>
          <p style={{ margin: "0 0 24px", color: "#666", fontSize: 14 }}>사용량 통계를 보려면 비밀번호를 입력하세요.</p>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #DDD", fontSize: 15, outline: "none" }}
              autoFocus
            />
            {error && <p style={{ color: "#E53E3E", fontSize: 13, margin: 0 }}>{error}</p>}
            <button
              type="submit"
              style={{ padding: "10px 0", borderRadius: 8, background: "#2D3748", color: "#fff", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer" }}
            >
              확인
            </button>
          </form>
        </div>
      </div>
    );
  }

  const totalTutor = daily.reduce((s, r) => s + r.tutor, 0);
  const totalAdmin = daily.reduce((s, r) => s + r.admin, 0);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>대시보드 사용량</h1>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: 14 }}>페이지 방문 기준 · 관리자 접속 제외한 튜터 사용량 확인</p>
        </div>
        <a href="/" style={{ fontSize: 13, color: "#666", textDecoration: "none" }}>← 대시보드로</a>
      </div>

      {/* 요약 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
        {[
          { label: "튜터 총 방문", value: totalTutor, color: "#3182CE" },
          { label: "관리자 총 방문", value: totalAdmin, color: "#718096" },
          { label: "활성 일수", value: daily.filter(d => d.tutor > 0).length, color: "#38A169" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "20px 24px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
            <p style={{ margin: "0 0 6px", fontSize: 13, color: "#666" }}>{label}</p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color }}>{loading ? "…" : value}</p>
          </div>
        ))}
      </div>

      {/* 날짜별 */}
      <div style={{ background: "#fff", borderRadius: 10, padding: "24px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>날짜별 방문</h3>
        {loading ? <p style={{ color: "#999", fontSize: 14 }}>로딩 중…</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #EEE" }}>
                {["날짜", "튜터", "관리자", "합계"].map(h => (
                  <th key={h} style={{ textAlign: h === "날짜" ? "left" : "right", padding: "6px 12px", color: "#555", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map((row) => (
                <tr key={row.date} style={{ borderBottom: "1px solid #F0F0F0" }}>
                  <td style={{ padding: "8px 12px", color: "#333" }}>{row.date}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#3182CE" }}>{row.tutor}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#999" }}>{row.admin}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{row.tutor + row.admin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 페이지별 */}
      <div style={{ background: "#fff", borderRadius: 10, padding: "24px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>페이지별 방문</h3>
        {loading ? <p style={{ color: "#999", fontSize: 14 }}>로딩 중…</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #EEE" }}>
                {["페이지", "튜터", "관리자"].map(h => (
                  <th key={h} style={{ textAlign: h === "페이지" ? "left" : "right", padding: "6px 12px", color: "#555", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pages.map((row) => (
                <tr key={row.page_path} style={{ borderBottom: "1px solid #F0F0F0" }}>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#444" }}>{row.page_path}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#3182CE" }}>{row.tutor}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#999" }}>{row.admin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
