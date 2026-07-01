"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Student, Chapter, QualEval, Constraint, DraftResult } from "./page";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);

const QUAL_LABELS = ["팀장감", "잘함", "평범", "못함", "주의", "관리필요"] as const;
const QUAL_MAP: Record<string, number> = {
  팀장감: 5, 잘함: 4, 평범: 3, 못함: 2, 주의: 1, 관리필요: 0,
};
const QUAL_COLORS: Record<string, string> = {
  팀장감: "#7F3F00", 잘함: "#1F4E79", 평범: "#375623",
  못함: "#833C00", 주의: "#C55A11", 관리필요: "#C00000",
};
const CONSTRAINT_TYPES: Record<string, string> = {
  hate_uni: "단방향 혐오", hate_bi: "쌍방 혐오",
  manual_sep: "수기 분리", mutual_sep: "전원 분리", forced_pair: "강제 합류",
};
const TEAM_COLORS = [
  "#FFF2CC","#FCE4D6","#DDEBF7","#E2EFDA","#F4CCCC","#D9EAD3",
  "#CFE2F3","#FFF3BF","#E8D5F5","#D0E0E3","#FFE4E1","#E6E0EC",
  "#FDEBD0","#D5E8D4","#EBF5FB","#FEF9E7",
];

type Tab = "students" | "qual" | "constraints" | "results";

export default function TeamAssignmentClient({
  students: initStudents,
  chapters,
  qualEvals: initQualEvals,
  constraints: initConstraints,
  draftResults: initDraftResults,
  cohort,
}: {
  students: Student[];
  chapters: Chapter[];
  qualEvals: QualEval[];
  constraints: Constraint[];
  draftResults: DraftResult[];
  cohort: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<Tab>("students");
  const [students, setStudents] = useState(initStudents);
  const [qualEvals, setQualEvals] = useState(initQualEvals);
  const [constraints, setConstraints] = useState(initConstraints);
  const [draftResults] = useState(initDraftResults);

  const [selectedQualChapter, setSelectedQualChapter] = useState(chapters[5]?.code ?? "");
  const [selectedResultChapter, setSelectedResultChapter] = useState(
    draftResults[0]?.chapter_code ?? chapters[5]?.code ?? ""
  );
  const [runLoading, setRunLoading] = useState(false);
  const [runLog, setRunLog] = useState<string | null>(null);

  // ── 탭 1: 수강생 team_excluded 토글 ─────────────────────────────────────────
  async function toggleExcluded(student: Student) {
    const newVal = !student.team_excluded;
    setStudents((prev) =>
      prev.map((s) => (s.id === student.id ? { ...s, team_excluded: newVal } : s))
    );
    await supabase
      .from("dm5_students")
      .update({ team_excluded: newVal })
      .eq("id", student.id);
  }

  // ── 탭 2: 정성 평가 upsert ───────────────────────────────────────────────────
  async function upsertQual(studentName: string, label: string) {
    const score = QUAL_MAP[label] ?? 3;
    const now = new Date().toISOString();
    setQualEvals((prev) => {
      const existing = prev.find(
        (q) => q.student_name === studentName && q.chapter_code === selectedQualChapter
      );
      if (existing) {
        return prev.map((q) =>
          q.student_name === studentName && q.chapter_code === selectedQualChapter
            ? { ...q, label, score, updated_at: now }
            : q
        );
      }
      return [
        ...prev,
        {
          id: Date.now(),
          student_name: studentName,
          cohort,
          chapter_code: selectedQualChapter,
          label,
          score,
          updated_at: now,
        },
      ];
    });
    await supabase.from("dm5_qual_evaluations").upsert(
      { student_name: studentName, cohort, chapter_code: selectedQualChapter, label, score, updated_at: now },
      { onConflict: "student_name,cohort,chapter_code" }
    );
  }

  // ── 탭 3: 제약 조건 CRUD ─────────────────────────────────────────────────────
  async function addConstraint(c: Omit<Constraint, "id" | "cohort" | "created_at">) {
    const { data, error } = await supabase
      .from("dm5_team_constraints")
      .insert({ ...c, cohort })
      .select()
      .single();
    if (!error && data) setConstraints((prev) => [...prev, data as Constraint]);
  }

  async function deleteConstraint(id: number) {
    setConstraints((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("dm5_team_constraints").delete().eq("id", id);
  }

  // ── 탭 4: 팀 편성 실행 ────────────────────────────────────────────────────────
  async function runAlgorithm() {
    setRunLoading(true);
    setRunLog(null);
    try {
      const res = await fetch("/api/team-assignment/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_code: selectedResultChapter, cohort }),
      });
      const json = await res.json() as { ok: boolean; output?: string; error?: string };
      if (json.ok) {
        setRunLog(`✅ 완료\n${json.output ?? ""}`);
        startTransition(() => router.refresh());
      } else {
        setRunLog(`❌ 실패\n${json.error ?? ""}`);
      }
    } catch (e) {
      setRunLog(`❌ 네트워크 오류: ${String(e)}`);
    }
    setRunLoading(false);
  }

  // ── 현재 챕터 결과 ─────────────────────────────────────────────────────────
  const latestRunId = draftResults
    .filter((r) => r.chapter_code === selectedResultChapter)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.run_id;

  const latestResults = latestRunId
    ? draftResults.filter((r) => r.run_id === latestRunId)
    : [];

  const teamNumbers = [...new Set(latestResults.map((r) => r.team_number))].sort((a, b) => a - b);

  const excludedCount = students.filter((s) => s.team_excluded).length;
  const activeCount = students.length - excludedCount;

  return (
    <div>
      {/* 탭 헤더 */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "2px solid #E8E8E8",
          marginBottom: 24,
        }}
      >
        {(
          [
            { key: "students", label: `대상 수강생 (${activeCount}명)` },
            { key: "qual", label: "정성 평가" },
            { key: "constraints", label: `제약 조건 (${constraints.length}건)` },
            { key: "results", label: "편성 결과" },
          ] as { key: Tab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: "10px 20px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: activeTab === key ? 700 : 400,
              color: activeTab === key ? "#1A1A1A" : "#888",
              borderBottom: activeTab === key ? "2px solid #1A1A1A" : "2px solid transparent",
              marginBottom: -2,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 탭 1: 대상 수강생 ── */}
      {activeTab === "students" && (
        <div>
          <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
            팀 편성에서 제외할 수강생을 선택하세요. 중도하차 또는 개인학습자입니다.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 8,
            }}
          >
            {students.map((s) => {
              const gender = s.dm5_student_profiles?.gender ?? "?";
              return (
                <div
                  key={s.id}
                  onClick={() => toggleExcluded(s)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: s.team_excluded ? "#FEF2F2" : "#FFF",
                    border: `1px solid ${s.team_excluded ? "#FCA5A5" : "#E8E8E8"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    opacity: s.team_excluded ? 0.75 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      border: `2px solid ${s.team_excluded ? "#EF4444" : "#D1D5DB"}`,
                      borderRadius: 4,
                      background: s.team_excluded ? "#EF4444" : "transparent",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {s.team_excluded && (
                      <span style={{ color: "#FFF", fontSize: 11, fontWeight: 700 }}>✕</span>
                    )}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{s.student_name}</span>
                  <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>
                    {gender === "남" ? "♂" : gender === "여" ? "♀" : "?"}
                  </span>
                </div>
              );
            })}
          </div>
          <p style={{ marginTop: 16, color: "#888", fontSize: 12 }}>
            팀 편성 대상: {activeCount}명 / 제외: {excludedCount}명
          </p>
        </div>
      )}

      {/* ── 탭 2: 정성 평가 ── */}
      {activeTab === "qual" && (
        <div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: "#666" }}>챕터 선택:</label>
            <select
              value={selectedQualChapter}
              onChange={(e) => setSelectedQualChapter(e.target.value)}
              style={{
                padding: "6px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              {chapters.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: "#888" }}>
              {qualEvals.filter((q) => q.chapter_code === selectedQualChapter).length}명 입력됨
            </span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F9F9F9" }}>
                {["이름", "성별", "현재 평가", "변경"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 12px",
                      border: "1px solid #E8E8E8",
                      textAlign: "left",
                      fontWeight: 600,
                      color: "#444",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students
                .filter((s) => !s.team_excluded)
                .map((s) => {
                  const eval_ = qualEvals.find(
                    (q) => q.student_name === s.student_name && q.chapter_code === selectedQualChapter
                  );
                  const current = eval_?.label ?? "미입력";
                  const gender = s.dm5_student_profiles?.gender ?? "?";
                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid #F0F0F0" }}>
                      <td style={{ padding: "7px 12px", fontWeight: 500 }}>{s.student_name}</td>
                      <td style={{ padding: "7px 12px", color: "#666" }}>
                        {gender === "남" ? "♂" : gender === "여" ? "♀" : "?"}
                      </td>
                      <td style={{ padding: "7px 12px" }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: QUAL_COLORS[current] ?? "#888",
                          }}
                        >
                          {current}
                        </span>
                      </td>
                      <td style={{ padding: "7px 12px" }}>
                        <select
                          value={eval_?.label ?? ""}
                          onChange={(e) => {
                            if (e.target.value) upsertQual(s.student_name, e.target.value);
                          }}
                          style={{
                            padding: "4px 8px",
                            border: "1px solid #D1D5DB",
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        >
                          <option value="">-- 선택 --</option>
                          {QUAL_LABELS.map((l) => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 탭 3: 제약 조건 ── */}
      {activeTab === "constraints" && (
        <ConstraintTab
          students={students}
          constraints={constraints}
          cohort={cohort}
          onAdd={addConstraint}
          onDelete={deleteConstraint}
        />
      )}

      {/* ── 탭 4: 편성 결과 ── */}
      {activeTab === "results" && (
        <div>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <select
              value={selectedResultChapter}
              onChange={(e) => setSelectedResultChapter(e.target.value)}
              style={{
                padding: "6px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              {chapters.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>

            <button
              onClick={runAlgorithm}
              disabled={runLoading}
              style={{
                padding: "8px 20px",
                background: runLoading ? "#9CA3AF" : "#1A1A1A",
                color: "#FFF",
                border: "none",
                borderRadius: 6,
                cursor: runLoading ? "not-allowed" : "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {runLoading ? "⏳ 실행 중..." : "▶ 팀 편성 실행"}
            </button>

            {latestRunId && (
              <span style={{ fontSize: 12, color: "#888" }}>
                최근 실행: {latestRunId}
              </span>
            )}
          </div>

          {runLog && (
            <pre
              style={{
                background: runLog.startsWith("✅") ? "#F0FDF4" : "#FEF2F2",
                border: `1px solid ${runLog.startsWith("✅") ? "#BBF7D0" : "#FECACA"}`,
                borderRadius: 6,
                padding: 12,
                fontSize: 11,
                whiteSpace: "pre-wrap",
                marginBottom: 20,
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {runLog}
            </pre>
          )}

          {latestResults.length > 0 ? (
            <div>
              <ResultSummary results={latestResults} />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 12,
                  marginTop: 16,
                }}
              >
                {teamNumbers.map((tn) => {
                  const members = latestResults
                    .filter((r) => r.team_number === tn)
                    .sort((a, b) => (b.is_leader ? 1 : 0) - (a.is_leader ? 1 : 0));
                  const leader = members.find((m) => m.is_leader);
                  const qa = members.reduce((s, m) => s + (m.peer_score ?? 0), 0) / members.length;
                  return (
                    <div
                      key={tn}
                      style={{
                        background: TEAM_COLORS[(tn - 1) % TEAM_COLORS.length],
                        border: "1px solid #E8E8E8",
                        borderRadius: 8,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          background: "#2F4F8F",
                          color: "#FFF",
                          padding: "8px 12px",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        팀{String(tn).padStart(2, "0")} ({members.length}명) — 동료평가 {qa.toFixed(2)} —{" "}
                        {leader?.student_name ?? "-"}
                      </div>
                      {members.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 12px",
                            borderBottom: "1px solid rgba(0,0,0,0.06)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: m.is_leader ? 700 : 400,
                              color:
                                m.gender === "남" ? "#1F497D" : "#1A1A1A",
                            }}
                          >
                            {m.is_leader ? "★ " : ""}{m.student_name}
                          </span>
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: 11,
                              color: QUAL_COLORS[m.qual_label ?? ""] ?? "#888",
                              fontWeight: 600,
                            }}
                          >
                            {m.qual_label ?? ""}
                          </span>
                          {m.has_soft_warning && (
                            <span style={{ fontSize: 10, color: "#C55A11" }}>⚠</span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "60px 0",
                color: "#888",
                fontSize: 14,
              }}
            >
              이 챕터의 편성 결과가 없습니다. 위 버튼으로 팀 편성을 실행하세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 편성 결과 요약 ────────────────────────────────────────────────────────────
function ResultSummary({ results }: { results: DraftResult[] }) {
  const hardErrors = 0;
  const softWarnings = results.filter((r) => r.has_soft_warning).length;
  const teams = [...new Set(results.map((r) => r.team_number))].length;

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 8,
      }}
    >
      {[
        { label: "총 배정", value: results.length, color: "#1A1A1A" },
        { label: "팀 수", value: teams, color: "#1A1A1A" },
        { label: "Hard 오류", value: hardErrors, color: hardErrors > 0 ? "#DC2626" : "#16A34A" },
        { label: "Soft 경고 인원", value: softWarnings, color: softWarnings > 0 ? "#D97706" : "#16A34A" },
      ].map(({ label, value, color }) => (
        <div
          key={label}
          style={{
            background: "#FFF",
            border: "1px solid #E8E8E8",
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 13,
          }}
        >
          <span style={{ color: "#888" }}>{label}: </span>
          <span style={{ fontWeight: 700, color }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// ── 제약 조건 탭 컴포넌트 ─────────────────────────────────────────────────────
function ConstraintTab({
  students,
  constraints,
  cohort,
  onAdd,
  onDelete,
}: {
  students: Student[];
  constraints: Constraint[];
  cohort: string;
  onAdd: (c: Omit<Constraint, "id" | "cohort" | "created_at">) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [newType, setNewType] = useState("hate_bi");
  const [newA, setNewA] = useState("");
  const [newB, setNewB] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newChapter, setNewChapter] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const studentNames = students.map((s) => s.student_name);

  async function handleAdd() {
    if (!newA) return;
    if (newType !== "mutual_sep" && !newB) return;
    setAdding(true);
    await onAdd({
      type: newType,
      student_a: newA,
      student_b: newType === "mutual_sep" ? null : newB,
      reason: newReason || null,
      chapter_code: newChapter,
    });
    setNewA(""); setNewB(""); setNewReason("");
    setAdding(false);
  }

  const grouped = Object.keys(CONSTRAINT_TYPES).reduce(
    (acc, type) => {
      acc[type] = constraints.filter((c) => c.type === type);
      return acc;
    },
    {} as Record<string, Constraint[]>
  );

  return (
    <div>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>
        팀 편성 시 적용할 제약 조건을 관리합니다. 불화 인원, 강제 분리, 강제 합류 등을 등록하세요.
      </p>

      {/* 새 제약 추가 폼 */}
      <div
        style={{
          background: "#F9F9F9",
          border: "1px solid #E8E8E8",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>유형</div>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            style={{ padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13 }}
          >
            {Object.entries(CONSTRAINT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>수강생 A</div>
          <input
            list="students-list"
            value={newA}
            onChange={(e) => setNewA(e.target.value)}
            placeholder="이름 입력"
            style={{ padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13, width: 120 }}
          />
        </div>
        {newType !== "mutual_sep" && (
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>수강생 B</div>
            <input
              list="students-list"
              value={newB}
              onChange={(e) => setNewB(e.target.value)}
              placeholder="이름 입력"
              style={{ padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13, width: 120 }}
            />
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>사유 (선택)</div>
          <input
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            placeholder="사유 입력"
            style={{ padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13, width: 160 }}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding}
          style={{
            padding: "7px 16px",
            background: "#1A1A1A",
            color: "#FFF",
            border: "none",
            borderRadius: 4,
            cursor: adding ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          + 추가
        </button>
        <datalist id="students-list">
          {studentNames.map((n) => <option key={n} value={n} />)}
        </datalist>
      </div>

      {/* 유형별 테이블 */}
      {Object.entries(CONSTRAINT_TYPES).map(([type, label]) => {
        const rows = grouped[type] ?? [];
        if (rows.length === 0) return null;
        return (
          <div key={type} style={{ marginBottom: 24 }}>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: type === "forced_pair" ? "#065F46" : "#7F1D1D",
                marginBottom: 8,
              }}
            >
              {label} ({rows.length}건)
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F9F9F9" }}>
                  {["수강생 A", "수강생 B", "사유", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "6px 10px",
                        border: "1px solid #E8E8E8",
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#444",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #F0F0F0" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 500 }}>{c.student_a}</td>
                    <td style={{ padding: "6px 10px", color: "#666" }}>{c.student_b ?? "—"}</td>
                    <td style={{ padding: "6px 10px", color: "#888", fontSize: 12 }}>{c.reason ?? ""}</td>
                    <td style={{ padding: "6px 10px" }}>
                      <button
                        onClick={() => onDelete(c.id)}
                        style={{
                          padding: "2px 8px",
                          background: "none",
                          border: "1px solid #FCA5A5",
                          borderRadius: 4,
                          color: "#EF4444",
                          cursor: "pointer",
                          fontSize: 11,
                        }}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {constraints.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#888", fontSize: 14 }}>
          등록된 제약 조건이 없습니다.
        </div>
      )}
    </div>
  );
}
