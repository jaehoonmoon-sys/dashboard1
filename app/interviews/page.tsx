import { supabase } from "../../lib/supabase";
import DashboardTable, { StudentSummary, InterviewStat } from "./DashboardTable";
import RefreshButton from "../RefreshButton";

export const dynamic = "force-dynamic";

type RiskLevel = "낮음" | "중간" | "높음" | "심각" | "없음";

export default async function Page() {
  const today = new Date().toISOString().slice(0, 10);

  const [summaryRes, intvRes, condRes] = await Promise.all([
    supabase
      .from("mj_student_summary")
      .select("*")
      .eq("cohort", "AI 기반 디지털 마케팅 부트캠프 5회차"),
    supabase.from("mj_student_interview_stats").select("*"),
    supabase
      .from("mj_condition_logs")
      .select("student_name, score")
      .gte("logged_at", `${today}T00:00:00`)
      .lte("logged_at", `${today}T23:59:59`)
      .not("student_name", "is", null),
  ]);

  const students = (summaryRes.data ?? []) as StudentSummary[];
  const stats = (intvRes.data ?? []) as InterviewStat[];

  const todayConditions = new Map<string, number>();
  for (const row of condRes.data ?? []) {
    if (row.student_name && row.score != null) {
      todayConditions.set(row.student_name, row.score);
    }
  }

  const critical = students.filter((s) =>
    [s.comm_risk, s.skill_risk, s.nps_risk, s.ops_risk].includes("심각")
  );
  const high = students.filter(
    (s) =>
      ![s.comm_risk, s.skill_risk, s.nps_risk, s.ops_risk].includes("심각") &&
      [s.comm_risk, s.skill_risk, s.nps_risk, s.ops_risk].includes("낮음")
  );

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 24px" }}>
      <header style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <a href="/" style={{ fontSize: 12, color: "#999", textDecoration: "none", display: "block", marginBottom: 8 }}>← 메인</a>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
            🎯 트랙 저성과자 면담 관리
          </h1>
          <p style={{ color: "#666", marginTop: 8, marginBottom: 0 }}>
            디마5기 · 컬럼 헤더 클릭으로 정렬 · 수강생 클릭 시 상세 페이지
          </p>
        </div>
        <RefreshButton />
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <Stat label="전체 수강생" value={students.length} accent="#1A1A1A" />
        <Stat label="심각 1개+ 보유" value={critical.length} accent="#DC2626" />
        <Stat label="높음만 (심각 X)" value={high.length} accent="#F59E0B" />
      </section>

      <DashboardTable
        students={students}
        stats={stats}
        hrefPrefix="/interviews"
        todayConditions={todayConditions}
      />

      <footer style={{ marginTop: 48, color: "#999", fontSize: 13 }}>
        디마5기 · {students.length}명 · 면담 {stats.length}명 cross-ref ·
        Pocketwatch 문재훈 · D-day 2026-05-22
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div
      style={{
        background: "#FFF",
        border: "1px solid #E8E8E8",
        borderRadius: 8,
        padding: "20px 24px",
      }}
    >
      <div style={{ fontSize: 13, color: "#666" }}>{label}</div>
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: accent,
          marginTop: 4,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
