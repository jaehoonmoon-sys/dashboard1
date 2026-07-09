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

type IpStat = {
  ip: string;
  visits: number;
  lastVisit: string;
  isAdmin: boolean;
};

type IpLog = {
  page_path: string;
  accessed_at: string;
};

function decodePath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [pages, setPages] = useState<PageStat[]>([]);
  const [ips, setIps] = useState<IpStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [ipLogs, setIpLogs] = useState<Record<string, IpLog[]>>({});
  const [selectedIp, setSelectedIp] = useState<string | null>(null);

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
      .from("dm5_access_logs")
      .select("accessed_at, page_path, is_admin, ip")
      .order("accessed_at", { ascending: false });

    if (!data) { setLoading(false); return; }

    const dailyMap: Record<string, { tutor: number; admin: number }> = {};
    const pageMap: Record<string, { tutor: number; admin: number }> = {};
    const ipMap: Record<string, { visits: number; lastVisit: string }> = {};
    const ipLogsMap: Record<string, IpLog[]> = {};
    const adminIpSet = new Set<string>();

    for (const row of data) {
      // 관리자 IP 수집
      if (row.is_admin && row.ip) {
        adminIpSet.add(row.ip);
      }

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

      // 튜터 방문 IP만 집계 (관리자 로그인 기록 제외)
      if (!row.is_admin && row.ip) {
        if (!ipMap[row.ip]) ipMap[row.ip] = { visits: 0, lastVisit: row.accessed_at };
        ipMap[row.ip].visits++;
        if (row.accessed_at > ipMap[row.ip].lastVisit) {
          ipMap[row.ip].lastVisit = row.accessed_at;
        }
        if (!ipLogsMap[row.ip]) ipLogsMap[row.ip] = [];
        ipLogsMap[row.ip].push({ page_path: row.page_path || "/", accessed_at: row.accessed_at });
      }
    }

    setIpLogs(ipLogsMap);

    // 관리자 IP도 목록에 포함 (방문 기록 없어도)
    for (const ip of adminIpSet) {
      if (!ipMap[ip]) ipMap[ip] = { visits: 0, lastVisit: "" };
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

    const ipList = Object.entries(ipMap)
      .map(([ip, v]) => ({ ip, ...v, isAdmin: adminIpSet.has(ip) }))
      .sort((a, b) => {
        // 관리자 IP 먼저, 그 다음 방문 수 내림차순
        if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
        return b.visits - a.visits;
      });
    setIps(ipList);
    setLoading(false);
  }

  useEffect(() => {
    const hasAdminCookie = document.cookie.split(";").some((c) => c.trim() === "is_admin=true");
    if (hasAdminCookie) {
      fetch("/api/admin-mode").catch(() => {}); // 쿠키 자동 로그인 시 IP 기록
      setAuthed(true);
      loadStats();
    }
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
  const tutorIpCount = ips.filter(i => !i.isAdmin).length;

  const selectedLogs = selectedIp ? (ipLogs[selectedIp] ?? []) : [];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>

      {/* IP 상세 로그 모달 */}
      {selectedIp && (
        <div
          onClick={() => setSelectedIp(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, padding: "28px 32px",
              width: "min(720px, 92vw)", maxHeight: "80vh",
              display: "flex", flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>IP 방문 상세</h3>
                <p style={{ margin: "4px 0 0", fontFamily: "monospace", fontSize: 14, color: "#555" }}>{selectedIp}</p>
              </div>
              <button
                onClick={() => setSelectedIp(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#888" }}>총 {selectedLogs.length}건 · 최신순</p>
            <div style={{ overflowY: "auto", flex: 1 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead style={{ position: "sticky", top: 0, background: "#fff" }}>
                  <tr style={{ borderBottom: "2px solid #EEE" }}>
                    <th style={{ textAlign: "left", padding: "6px 12px", color: "#555", fontWeight: 600 }}>시각</th>
                    <th style={{ textAlign: "left", padding: "6px 12px", color: "#555", fontWeight: 600 }}>페이지</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLogs.map((log, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #F5F5F5" }}>
                      <td style={{ padding: "7px 12px", color: "#666", whiteSpace: "nowrap" }}>
                        {new Date(log.accessed_at).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                          month: "2-digit", day: "2-digit",
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "monospace", color: "#333" }}>
                        {decodePath(log.page_path)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>대시보드 사용량</h1>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: 14 }}>페이지 방문 기준 · 관리자 접속 제외한 튜터 사용량 확인</p>
        </div>
        <a href="/" style={{ fontSize: 13, color: "#666", textDecoration: "none" }}>← 대시보드로</a>
      </div>

      {/* 요약 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
        {[
          { label: "튜터 총 방문", value: totalTutor, color: "#3182CE" },
          { label: "관리자 총 방문", value: totalAdmin, color: "#718096" },
          { label: "활성 일수", value: daily.filter(d => d.tutor > 0).length, color: "#38A169" },
          { label: "튜터 IP 수", value: tutorIpCount, color: "#D69E2E" },
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

      {/* IP별 */}
      <div style={{ background: "#fff", borderRadius: 10, padding: "24px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>IP별 방문</h3>
        {loading ? <p style={{ color: "#999", fontSize: 14 }}>로딩 중…</p> : ips.length === 0 ? (
          <p style={{ color: "#999", fontSize: 14 }}>데이터 없음</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #EEE" }}>
                {["구분", "IP", "방문 수", "마지막 접속", ""].map(h => (
                  <th key={h} style={{ textAlign: h === "구분" || h === "IP" || h === "" ? "left" : "right", padding: "6px 12px", color: "#555", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ips.map((row) => (
                <tr
                  key={row.ip}
                  onClick={() => !row.isAdmin && row.visits > 0 ? setSelectedIp(row.ip) : undefined}
                  style={{
                    borderBottom: "1px solid #F0F0F0",
                    background: row.isAdmin ? "#FAFAFA" : "transparent",
                    cursor: !row.isAdmin && row.visits > 0 ? "pointer" : "default",
                  }}
                  onMouseEnter={e => { if (!row.isAdmin && row.visits > 0) (e.currentTarget as HTMLTableRowElement).style.background = "#FFFBEB"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = row.isAdmin ? "#FAFAFA" : "transparent"; }}
                >
                  <td style={{ padding: "8px 12px" }}>
                    {row.isAdmin
                      ? <span style={{ background: "#2D3748", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>관리자</span>
                      : <span style={{ background: "#EBF8FF", color: "#2B6CB0", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>튜터</span>
                    }
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", color: row.isAdmin ? "#999" : "#444" }}>{row.ip || "(미확인)"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: row.isAdmin ? "#999" : "#D69E2E" }}>
                    {row.visits > 0 ? row.visits : "-"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#666", fontSize: 13 }}>
                    {row.lastVisit
                      ? new Date(row.lastVisit).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                      : "-"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#BBBBBB", fontSize: 12 }}>
                    {!row.isAdmin && row.visits > 0 ? "상세 보기 →" : ""}
                  </td>
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
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#444" }}>{decodePath(row.page_path)}</td>
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
