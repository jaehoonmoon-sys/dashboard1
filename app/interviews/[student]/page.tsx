import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { CHAPTERS, CHAPTER_END, dateToChapterOrder } from "../../../lib/curriculum";
import TimelineChart, { ConditionPoint } from "./TimelineChart";
import ConditionCalendar, { ConditionLog } from "./ConditionCalendar";
import PeerChapterCard, { PeerComment } from "./PeerChapterCard";
import { NotionContent } from "./NotionContent";

const CURRICULUM = CHAPTERS.map((ch) => ({ order: ch.order, name: ch.fullName, period: ch.period }));

export const dynamic = "force-dynamic";

type TimelineRow = {
  id: number;
  student_name: string;
  cohort: string;
  chapter: string;
  chapter_order: number;
  team_no: number | null;
  role: string | null;
  peer_communication: number | null;
  peer_skill: number | null;
  peer_growth: number | null;
  peer_immersion: number | null;
  self_communication: number | null;
  self_skill: number | null;
  self_growth: number | null;
  self_immersion: number | null;
  nps_score: number | null;
  nps_comment: string | null;
  ops_satisfaction: number | null;
  ops_satisfaction_comment: string | null;
  self_comment_comm_immerse: string | null;
  self_comment_skill_growth: string | null;
  submitted_at: string;
};

type InterviewRow = {
  id: number;
  notion_url: string;
  interview_date: string;
  student_name: string;
  interviewer: string | null;
  summary: string | null;
  types: string[];
  chapter: string | null;
  title: string;
  content: string | null;
};

type ConditionRow = {
  id: number;
  student_name: string | null;
  score: number | null;
  content: string | null;
  contact_request: boolean;
  logged_at: string | null;
};

type StudentProfile = {
  birthday: string | null;
  gender: string | null;
  occupation: string | null;
  experience_level: string | null;
  join_reference: string | null;
  join_painpoint: string | null;
  join_needs: string | null;
};

type LectureProgress = {
  progress_rate: number;
  is_completed: boolean;
  course_id: number;
  mj_courses: {
    id: number;
    name: string;
    chapter_code: string;
    hours: number | null;
  } | null;
};

const TYPE_COLOR: Record<string, string> = {
  "하차 희망": "#DC2626", 고관여자면담: "#DC2626", 방향성고민: "#8B5CF6",
  팀플진행: "#3B82F6", 과제수행: "#EC4899", 포트폴리오: "#92400E",
  취업방향: "#F59E0B", 단순질의: "#9CA3AF", TIL: "#3B82F6",
  과제피드백: "#9CA3AF", SNS채널: "#10B981",
};

export default async function Page({
  params,
}: {
  params: Promise<{ student: string }>;
}) {
  const { student } = await params;
  const studentName = decodeURIComponent(student);

  // 먼저 student_id를 가져온 뒤 profile · lecture 조회에 사용
  const studentRes = await supabase
    .from("mj_students")
    .select("id")
    .eq("student_name", studentName)
    .maybeSingle();
  const studentId = studentRes.data?.id ?? null;

  const [tlRes, intvRes, peerRecRes, peerGivRes, condRes, profileRes, lectureRes] = await Promise.all([
    supabase
      .from("mj_student_timeline")
      .select("*")
      .eq("student_name", studentName)
      .eq("cohort", "AI 기반 디지털 마케팅 부트캠프 5회차")
      .order("chapter_order", { ascending: true }),
    supabase
      .from("mj_interview_records")
      .select("*")
      .eq("student_name", studentName)
      .order("interview_date", { ascending: true }),
    supabase
      .from("mj_peer_comments")
      .select("*")
      .eq("evaluated_name", studentName)
      .neq("evaluator_name", studentName)
      .order("submitted_at", { ascending: true }),
    supabase
      .from("mj_peer_comments")
      .select("*")
      .eq("evaluator_name", studentName)
      .neq("evaluated_name", studentName)
      .order("submitted_at", { ascending: true }),
    supabase
      .from("mj_condition_logs")
      .select("*")
      .eq("student_name", studentName)
      .order("logged_at", { ascending: true }),
    studentId
      ? supabase
          .from("mj_student_profiles")
          .select("birthday,gender,occupation,experience_level,join_reference,join_painpoint,join_needs")
          .eq("student_id", studentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    studentId
      ? supabase
          .from("mj_lecture_progress")
          .select("progress_rate, is_completed, course_id, mj_courses(id, name, chapter_code, hours)")
          .eq("student_id", studentId)
          .order("course_id")
      : Promise.resolve({ data: [] }),
  ]);

  const timeline = (tlRes.data ?? []) as TimelineRow[];
  const interviews = (intvRes.data ?? []) as InterviewRow[];
  const peerReceived = (peerRecRes.data ?? []) as PeerComment[];
  const peerGiven = (peerGivRes.data ?? []) as PeerComment[];
  const conditionLogs = (condRes.data ?? []) as ConditionRow[];
  const profile = (profileRes.data ?? null) as StudentProfile | null;
  const lectureProgress = (lectureRes.data as unknown as LectureProgress[]) ?? [];

  // chapter_code("CH.0") → order(0) 매핑 후, order 키로 그룹핑
  const codeToOrder = new Map(CHAPTERS.map((ch) => [ch.name, ch.order]));
  const lectureByChapter = new Map<number, LectureProgress[]>();
  for (const lp of lectureProgress) {
    const order = codeToOrder.get(lp.mj_courses?.chapter_code ?? "");
    if (order == null) continue;
    if (!lectureByChapter.has(order)) lectureByChapter.set(order, []);
    lectureByChapter.get(order)!.push(lp);
  }

  const byChapter = new Map<number, TimelineRow>();
  for (const t of timeline) {
    if (!byChapter.has(t.chapter_order)) byChapter.set(t.chapter_order, t);
  }

  const interviewsByChapter = new Map<number, InterviewRow[]>();
  for (const iv of interviews) {
    const order = dateToChapterOrder(iv.interview_date);
    if (!interviewsByChapter.has(order)) interviewsByChapter.set(order, []);
    interviewsByChapter.get(order)!.push(iv);
  }

  const evaluations = timeline.map((t) => ({
    date: CHAPTER_END[t.chapter_order] ?? t.submitted_at.slice(0, 10),
    nps: t.nps_score,
    ops: t.ops_satisfaction,
    chapter: CURRICULUM[t.chapter_order]?.name ?? t.chapter,
    nps_comment: t.nps_comment,
    ops_comment: t.ops_satisfaction_comment,
  }));

  const interviewPoints = interviews.map((iv) => ({
    date: iv.interview_date,
    types: iv.types ?? [],
    summary: iv.summary,
    content: iv.content,
    chapter: iv.chapter,
  }));

  const conditionPoints: ConditionPoint[] = conditionLogs.map((c) => ({
    date: c.logged_at?.slice(0, 10) ?? "",
    score: c.score,
    content: c.content,
    contact_request: c.contact_request,
  }));

  const calendarLogs: ConditionLog[] = conditionLogs.map((c) => ({
    score: c.score,
    content: c.content,
    contact_request: c.contact_request,
    logged_at: c.logged_at,
  }));

  const peerNames = [
    ...new Set([
      ...peerReceived.map((p) => p.evaluator_name).filter((n): n is string => n != null),
      ...peerGiven.map((p) => p.evaluated_name),
    ]),
  ];
  const roleRows =
    peerNames.length > 0
      ? (
          (
            await supabase
              .from("mj_student_timeline")
              .select("student_name, role, chapter")
              .in("student_name", peerNames)
              .not("role", "is", null)
          ).data ?? []
        )
      : [];
  const roleMap: Record<string, string> = {};
  for (const r of roleRows) {
    roleMap[`${r.student_name}||${r.chapter}`] = r.role;
  }

  const peerRecByChapter = new Map<string, PeerComment[]>();
  for (const p of peerReceived) {
    const key = p.chapter ?? "챕터 미상";
    if (!peerRecByChapter.has(key)) peerRecByChapter.set(key, []);
    peerRecByChapter.get(key)!.push(p);
  }

  const peerGivByChapter = new Map<string, PeerComment[]>();
  for (const p of peerGiven) {
    const key = p.chapter ?? "챕터 미상";
    if (!peerGivByChapter.has(key)) peerGivByChapter.set(key, []);
    peerGivByChapter.get(key)!.push(p);
  }

  const allPeerChapters = Array.from(
    new Set([...peerRecByChapter.keys(), ...peerGivByChapter.keys()])
  ).sort();

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px" }}>
      <header style={{ marginBottom: 20 }}>
        <Link
          href="/interviews"
          style={{
            display: "inline-block", fontSize: 12, color: "#999",
            textDecoration: "none", marginBottom: 12, letterSpacing: "0.1em",
          }}
        >
          ← 전체 명단
        </Link>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>{studentName}</h1>
        <p style={{ color: "#666", marginTop: 6, marginBottom: 0, fontSize: 14 }}>
          디마 5기 · 평가 {timeline.length}건 · 면담 {interviews.length}건 ·
          동료평가 받은 {peerReceived.length}건 · 준 {peerGiven.length}건 · 컨디션 {conditionLogs.length}건
        </p>
      </header>

      {/* 개인 배경 프로필 카드 */}
      {profile && <ProfileCard profile={profile} />}

      <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>📈 시계열</h2>
      <p style={{ fontSize: 12, color: "#888", marginTop: 0, marginBottom: 12 }}>
        NPS·운영만족도 (좌축) · 컨디션 (우축 0–4) · 면담 마커 (초록)
      </p>
      <section style={{
        background: "#FFF", border: "1px solid #E8E8E8", borderRadius: 8,
        padding: "16px 8px 8px", marginBottom: 36,
      }}>
        <TimelineChart
          evaluations={evaluations}
          interviews={interviewPoints}
          conditionLogs={conditionPoints}
        />
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 32, marginBottom: 48, alignItems: "start" }}>
        <div>
          <h2 style={{ fontSize: 18, margin: "0 0 16px" }}>📊 챕터별 상세</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {CURRICULUM.map((ch) => {
              const data = byChapter.get(ch.order);
              const chInterviews = interviewsByChapter.get(ch.order) ?? [];
              const chLecture = lectureByChapter.get(ch.order) ?? [];
              return (
                <div key={ch.order}>
                  <ChapterCard chapter={ch} data={data} lectures={chLecture} />
                  {chInterviews.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8, paddingLeft: 12, borderLeft: "2px solid #E5E7EB" }}>
                      {chInterviews.map((iv) => (
                        <InterviewCard key={iv.id} iv={iv} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ position: "sticky", top: 24 }}>
          <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>🗓 컨디션 달력</h2>
          <p style={{ fontSize: 11, color: "#999", marginTop: 0, marginBottom: 12 }}>
            날짜에 커서를 올리면 코멘트·상담신청 여부 표시
          </p>
          <section style={{
            background: "#FFF", border: "1px solid #E8E8E8",
            borderRadius: 8, padding: 16,
          }}>
            <ConditionCalendar logs={calendarLogs} />
          </section>
        </div>
      </div>

      <h2 style={{ fontSize: 18, margin: "0 0 16px" }}>
        👥 동료평가 (받은 {peerReceived.length}건 · 준 {peerGiven.length}건)
      </h2>
      <section style={{ marginBottom: 48 }}>
        {peerReceived.length === 0 && peerGiven.length === 0 ? (
          <p style={{ color: "#999", fontSize: 14 }}>동료평가 기록 없음</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {allPeerChapters.map((chapter) => (
              <PeerChapterCard
                key={chapter}
                chapter={chapter}
                received={peerRecByChapter.get(chapter) ?? []}
                given={peerGivByChapter.get(chapter) ?? []}
                roleMap={roleMap}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ProfileCard({ profile }: { profile: StudentProfile }) {
  const age = profile.birthday
    ? new Date().getFullYear() - new Date(profile.birthday).getFullYear() + 1
    : null;

  const items: { label: string; value: string | null | undefined }[] = [
    { label: "생년월일", value: profile.birthday ? `${profile.birthday.slice(0, 4)}년생${age ? ` (${age}세)` : ""}` : null },
    { label: "성별", value: profile.gender },
    { label: "현재 상태", value: profile.occupation },
    { label: "관련 경험", value: profile.experience_level },
    { label: "지원 경로", value: profile.join_reference },
    { label: "페인포인트", value: profile.join_painpoint },
    { label: "필요한 것", value: profile.join_needs },
  ].filter((i) => i.value);

  if (items.length === 0) return null;

  return (
    <section style={{
      background: "#F8FAFF", border: "1px solid #DBEAFE", borderRadius: 8,
      padding: "14px 20px", marginBottom: 28,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#3B82F6", marginBottom: 10, letterSpacing: "0.05em" }}>
        👤 개인 배경
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: "flex", gap: 6, fontSize: 13 }}>
            <span style={{ color: "#9CA3AF", whiteSpace: "nowrap" }}>{item.label}</span>
            <span style={{ color: "#1F2937", fontWeight: 500 }}>{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChapterCard({
  chapter,
  data,
  lectures,
}: {
  chapter: { order: number; name: string; period: string };
  data: TimelineRow | undefined;
  lectures: LectureProgress[];
}) {
  const hasData = !!data;
  return (
    <div style={{
      background: "#FFF", border: "1px solid #E8E8E8",
      borderLeft: `4px solid ${hasData ? "#3B82F6" : "#E5E7EB"}`,
      borderRadius: 8, padding: 20, opacity: hasData ? 1 : 0.55,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: hasData ? 16 : 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{chapter.name}</div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{chapter.period}</div>
        </div>
        {hasData ? (
          <div style={{ fontSize: 12, color: "#666" }}>팀 {data!.team_no ?? "-"} · {data!.role ?? "-"}</div>
        ) : (
          <div style={{ fontSize: 12, color: "#BBB" }}>데이터 없음</div>
        )}
      </div>

      {hasData && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr) repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
            <ScoreCell label="소통" peer={data!.peer_communication} self={data!.self_communication} max={7} />
            <ScoreCell label="실력" peer={data!.peer_skill} self={data!.self_skill} max={7} />
            <ScoreCell label="성장" peer={data!.peer_growth} self={data!.self_growth} max={7} />
            <ScoreCell label="몰입" peer={data!.peer_immersion} self={data!.self_immersion} max={7} />
            <ScoreCell label="NPS" peer={data!.nps_score} max={10} solo />
            <ScoreCell label="운영만족도" peer={data!.ops_satisfaction} max={10} solo />
          </div>

          {(data!.nps_comment || data!.ops_satisfaction_comment || data!.self_comment_comm_immerse || data!.self_comment_skill_growth) && (
            <details style={{ fontSize: 13, color: "#444" }}>
              <summary style={{ cursor: "pointer", color: "#666" }}>코멘트 펼치기</summary>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, paddingLeft: 8, borderLeft: "2px solid #E8E8E8", paddingTop: 4 }}>
                {data!.nps_comment && <CommentBlock label="NPS 코멘트" body={data!.nps_comment} />}
                {data!.ops_satisfaction_comment && <CommentBlock label="운영만족도 코멘트" body={data!.ops_satisfaction_comment} />}
                {data!.self_comment_comm_immerse && <CommentBlock label="자평: 소통/몰입" body={data!.self_comment_comm_immerse} />}
                {data!.self_comment_skill_growth && <CommentBlock label="자평: 실력/성장" body={data!.self_comment_skill_growth} />}
              </div>
            </details>
          )}
        </>
      )}

      {/* 강의 진도 (데이터 없는 챕터도 강의가 있으면 표시) */}
      {lectures.length > 0 && (
        <div style={{ marginTop: hasData ? 16 : 0, paddingTop: hasData ? 16 : 0, borderTop: hasData ? "1px solid #F0F0F0" : "none" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 10, letterSpacing: "0.05em" }}>
            📚 강의 진도
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lectures.map((lp) => {
              const rate = lp.progress_rate ?? 0;
              const barColor = lp.is_completed ? "#10B981" : rate >= 80 ? "#3B82F6" : rate >= 40 ? "#F59E0B" : "#E5E7EB";
              return (
                <div key={lp.course_id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "#374151" }}>{lp.mj_courses?.name ?? `course ${lp.course_id}`}</span>
                    <span style={{ fontWeight: 600, color: lp.is_completed ? "#10B981" : "#6B7280" }}>
                      {lp.is_completed ? "✓ 완료" : `${rate}%`}
                      {lp.mj_courses?.hours && <span style={{ fontWeight: 400, color: "#9CA3AF", marginLeft: 4 }}>{lp.mj_courses.hours}h</span>}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "#F3F4F6", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${rate}%`, background: barColor, borderRadius: 3, transition: "width 0.3s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function InterviewCard({ iv }: { iv: InterviewRow }) {
  return (
    <details style={{ background: "#FFF", border: "1px solid #E8E8E8", borderRadius: 8, overflow: "hidden" }}>
      <summary style={{ listStyle: "none", padding: 16, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{iv.interview_date}</span>
            {iv.chapter && <span style={{ color: "#999", fontSize: 12 }}>· {iv.chapter}</span>}
            {iv.interviewer && (
              <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 10,
                background: "#F3E8FF", color: "#7C3AED", fontWeight: 600,
              }}>
                👤 {iv.interviewer}
              </span>
            )}
          </div>
          <span style={{ color: "#999", fontSize: 11 }}>▼ 펼치기</span>
        </div>

        {iv.types && iv.types.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {iv.types.map((t) => (
              <span key={t} style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 10,
                background: `${TYPE_COLOR[t] ?? "#9CA3AF"}1A`,
                color: TYPE_COLOR[t] ?? "#6B7280", fontWeight: 600,
              }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {iv.summary && <div style={{ fontSize: 13, color: "#444" }}>{iv.summary}</div>}
      </summary>

      <div style={{ padding: "0 16px 16px", borderTop: "1px solid #F0F0F0" }}>
        {iv.content ? (
          <div style={{ color: "#333", lineHeight: 1.7, paddingTop: 12 }}>
            <NotionContent content={iv.content} />
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#999", paddingTop: 12 }}>본문 미적재</div>
        )}
      </div>
    </details>
  );
}

function ScoreCell({ label, peer, self, max, solo }: {
  label: string; peer: number | null; self?: number | null; max: number; solo?: boolean;
}) {
  const color = peer == null ? "#D1D5DB" : riskColor(peer, max);
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 6, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>
        {peer != null ? (
          <>
            {peer.toFixed(1)}
            <span style={{ fontSize: 11, color: "#AAA", fontWeight: 400 }}>/{max}</span>
          </>
        ) : "—"}
      </div>
      {!solo && self != null && (
        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>자평 {self.toFixed(1)}</div>
      )}
    </div>
  );
}

function CommentBlock({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 2, letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap" }}>{body}</div>
    </div>
  );
}

function riskColor(score: number, max: number): string {
  const r = score / max;
  if (r < 0.5) return "#DC2626";
  if (r < 0.65) return "#F59E0B";
  if (r < 0.8) return "#3B82F6";
  return "#10B981";
}
