import { supabase } from "../../lib/supabase";
import { StudentSummary, InterviewStat } from "./DashboardTable";
import RefreshButton from "../RefreshButton";
import InterviewsPageClient from "./InterviewsPageClient";
import { CHAPTERS } from "../../lib/curriculum";

export const dynamic = "force-dynamic";

const COHORT = "AI 기반 디지털 마케팅 부트캠프 5회차";

export type LectureProgress = {
  student_name: string;
  chapter_code: string;
  course_name: string;
  progress_rate: number;
  is_completed: boolean;
};

export type RiskLevel = "낮음" | "중간" | "높음" | "심각" | "없음";
export type ChapterScore = {
  comm_risk: RiskLevel;
  skill_risk: RiskLevel;
  nps_risk: RiskLevel;
  ops_risk: RiskLevel;
};

export type ChapterRoleMap = Record<number, Record<string, string>>;

function calcRisk(val: number | null | undefined, thresholds: [number, number, number]): RiskLevel {
  if (val == null) return "없음";
  if (val <= thresholds[0]) return "심각";
  if (val <= thresholds[1]) return "낮음";
  if (val <= thresholds[2]) return "중간";
  return "높음";
}

export default async function Page() {
  const today = new Date().toISOString().slice(0, 10);

  const codeToOrder = new Map(CHAPTERS.map((c) => [c.name, c.order]));

  const [summaryRes, intvRes, condRes, teamRes, teamMembersRes, progressRes] = await Promise.all([
    supabase
      .from("dm5_student_summary")
      .select("*")
      .eq("cohort", COHORT)
      .eq("is_active", true),
    supabase.from("dm5_student_interview_stats").select("*"),
    supabase
      .from("dm5_condition_logs")
      .select("student_name, score")
      .gte("logged_at", `${today}T00:00:00`)
      .lte("logged_at", `${today}T23:59:59`)
      .not("student_name", "is", null),
    // 챕터별 다면평가 점수 (Redash 7200 → dm5_evaluations)
    supabase
      .from("dm5_student_timeline")
      .select("chapter_order, student_name, peer_communication, peer_skill, peer_growth, peer_immersion, nps_score, ops_satisfaction")
      .eq("cohort", COHORT)
      .not("student_name", "is", null),
    // 팀 편성 + 팀장 (Redash → dm5_teams + dm5_team_members, 구글 시트 미사용)
    supabase
      .from("dm5_team_members")
      .select("name, is_leader, dm5_teams!inner(team_num, chapter_code)"),
    // 수강률
    supabase.rpc("get_student_lecture_progress"),
  ]);

  const students = (summaryRes.data ?? []) as StudentSummary[];
  const stats = (intvRes.data ?? []) as InterviewStat[];
  const lectureProgress = (progressRes.data ?? []) as LectureProgress[];

  const todayConditions: Record<string, number> = {};
  for (const row of condRes.data ?? []) {
    if (row.student_name && row.score != null) {
      todayConditions[row.student_name] = row.score;
    }
  }

  const teamMapByOrder: Record<number, Record<string, string[]>> = {};
  for (const ch of CHAPTERS) teamMapByOrder[ch.order] = {};

  // 챕터별 다면평가 점수 맵
  const chapterScoreMap: Record<number, Map<string, ChapterScore>> = {};
  for (const row of teamRes.data ?? []) {
    const order = row.chapter_order as number;
    if (order == null || order >= 99) continue;
    if (!chapterScoreMap[order]) chapterScoreMap[order] = new Map();
    const avgSkill =
      row.peer_skill != null
        ? ((Number(row.peer_skill) + Number(row.peer_growth ?? 0) + Number(row.peer_immersion ?? 0)) / 3)
        : null;
    chapterScoreMap[order].set(row.student_name, {
      comm_risk:  calcRisk(row.peer_communication != null ? Number(row.peer_communication) : null, [4, 5, 6]),
      skill_risk: calcRisk(avgSkill, [4, 5, 6]),
      nps_risk:   calcRisk(row.nps_score != null ? Number(row.nps_score) : null, [4, 6, 8]),
      ops_risk:   calcRisk(row.ops_satisfaction != null ? Number(row.ops_satisfaction) : null, [4, 6, 8]),
    });
  }

  // 팀 편성 + 팀장: dm5_team_members.is_leader 기반 (구글 시트 완전 미사용)
  type TeamMemberRow = { name: string; is_leader: boolean; dm5_teams: { team_num: number; chapter_code: string } };
  const chapterRoleMap: ChapterRoleMap = {};

  for (const raw of (teamMembersRes.data ?? []) as unknown as TeamMemberRow[]) {
    const t = raw.dm5_teams;
    const order = codeToOrder.get(t.chapter_code);
    if (order == null) continue;
    if ((CHAPTERS.find((c) => c.order === order)?.start ?? "") > today) continue;

    const tk = String(t.team_num);
    if (!teamMapByOrder[order][tk]) teamMapByOrder[order][tk] = [];
    if (!teamMapByOrder[order][tk].includes(raw.name)) {
      teamMapByOrder[order][tk].push(raw.name);
    }
    if (raw.is_leader) {
      if (!chapterRoleMap[order]) chapterRoleMap[order] = {};
      chapterRoleMap[order][raw.name] = "팀장";
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
          <a href="/marketer-5" style={{ fontSize: 12, color: "#999", textDecoration: "none", display: "block", marginBottom: 8 }}>← 마케터 5회차</a>
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
        <Stat label="낮음 1개+ (심각 없음)" value={high.length} accent="#F59E0B" />
      </section>

      <InterviewsPageClient
        students={students}
        stats={stats}
        todayConditions={todayConditions}
        teamMapByOrder={teamMapByOrder}
        lectureProgress={lectureProgress}
        chapterScoreMap={Object.fromEntries(
          Object.entries(chapterScoreMap).map(([k, v]) => [k, Object.fromEntries(v)])
        )}
        chapterRoleMap={chapterRoleMap}
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
