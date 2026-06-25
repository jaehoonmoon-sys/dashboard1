import { supabase } from "../../lib/supabase";
import TeamAssignmentClient from "./TeamAssignmentClient";

export const dynamic = "force-dynamic";

const COHORT = "AI 기반 디지털 마케팅 부트캠프 5회차";

export type Student = {
  id: number;
  student_name: string;
  team_excluded: boolean;
  mj_student_profiles: { gender: string | null } | null;
};

export type Chapter = {
  code: string;
  title: string;
  chapter_type: string | null;
};

export type QualEval = {
  id: number;
  student_name: string;
  cohort: string;
  chapter_code: string;
  label: string;
  score: number;
  updated_at: string;
};

export type Constraint = {
  id: number;
  cohort: string;
  chapter_code: string | null;
  type: string;
  student_a: string;
  student_b: string | null;
  reason: string | null;
  created_at: string;
};

export type DraftResult = {
  id: number;
  run_id: string;
  cohort: string;
  chapter_code: string;
  team_number: number;
  student_name: string;
  is_leader: boolean;
  qual_label: string | null;
  quant_score: number | null;
  peer_score: number | null;
  gender: string | null;
  has_soft_warning: boolean;
  is_final: boolean;
  created_at: string;
};

export default async function Page() {
  const [studRes, chapRes, qualRes, constrRes, draftRes] = await Promise.all([
    supabase
      .from("mj_students")
      .select("id, student_name, team_excluded, mj_student_profiles(gender)")
      .eq("cohort", COHORT)
      .eq("is_active", true)
      .order("student_name"),
    supabase
      .from("mj_chapters")
      .select("code, title, chapter_type")
      .order("code"),
    supabase
      .from("mj_qual_evaluations")
      .select("*")
      .eq("cohort", COHORT),
    supabase
      .from("mj_team_constraints")
      .select("*")
      .eq("cohort", COHORT)
      .order("type"),
    supabase
      .from("mj_team_draft_results")
      .select("*")
      .eq("cohort", COHORT)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: "48px 24px" }}>
      <header style={{ marginBottom: 32 }}>
        <a
          href="/"
          style={{
            fontSize: 12,
            color: "#999",
            textDecoration: "none",
            display: "block",
            marginBottom: 8,
          }}
        >
          ← 메인
        </a>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          🧩 팀 편성 관리
        </h1>
        <p style={{ color: "#666", marginTop: 8, marginBottom: 0 }}>
          디마5기 · 수강생 제외, 정성 평가, 제약 조건 설정 후 팀 편성 실행
        </p>
      </header>

      <TeamAssignmentClient
        students={(studRes.data ?? []) as unknown as Student[]}
        chapters={(chapRes.data ?? []) as Chapter[]}
        qualEvals={(qualRes.data ?? []) as QualEval[]}
        constraints={(constrRes.data ?? []) as Constraint[]}
        draftResults={(draftRes.data ?? []) as DraftResult[]}
        cohort={COHORT}
      />
    </main>
  );
}
