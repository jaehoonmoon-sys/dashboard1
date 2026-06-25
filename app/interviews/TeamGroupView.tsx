"use client";

import Link from "next/link";
import { StudentSummary, InterviewStat } from "./DashboardTable";
import { LectureProgress, ChapterScore, RiskLevel } from "./page";

const RISK_COLOR: Record<RiskLevel, string> = {
  심각: "#DC2626",
  낮음: "#F59E0B",
  중간: "#3B82F6",
  높음: "#10B981",
  없음: "#D1D5DB",
};

const RISK_RANK: Record<RiskLevel, number> = {
  심각: 4,
  낮음: 3,
  중간: 2,
  높음: 1,
  없음: 0,
};

const COND_EMOJI = ["😰", "😟", "😐", "😊", "😄"];

function riskTotal(s: StudentSummary) {
  return (
    RISK_RANK[s.comm_risk] +
    RISK_RANK[s.skill_risk] +
    RISK_RANK[s.nps_risk] +
    RISK_RANK[s.ops_risk]
  );
}

function RiskDot({ level, label }: { level: RiskLevel; label: string }) {
  const color = RISK_COLOR[level];
  return (
    <span
      title={`${label}: ${level}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: "2px 6px",
        borderRadius: 10,
        background: `${color}18`,
        color,
        fontSize: 10,
        fontWeight: 600,
      }}
    >
      {label} {level}
    </span>
  );
}

export default function TeamGroupView({
  chapter,
  chapterCode,
  teamMap,
  students,
  stats,
  todayConditions,
  hrefPrefix,
  lectureProgress,
  chapterScores,
  chapterRoles,
}: {
  chapter: string;
  chapterCode: string;
  teamMap: Record<string, string[]>;
  students: StudentSummary[];
  stats: InterviewStat[];
  todayConditions: Map<string, number>;
  hrefPrefix: string;
  lectureProgress: LectureProgress[];
  chapterScores: Record<string, ChapterScore>;
  chapterRoles: Record<string, string>;
}) {
  const studentMap = new Map(students.map((s) => [s.student_name, s]));
  const statMap = new Map(stats.map((s) => [s.student_name, s]));

  // 현재 챕터의 수강률: student_name → { courseName: rate }[]
  const progressByStudent = new Map<string, { name: string; rate: number; done: boolean }[]>();
  for (const lp of lectureProgress) {
    if (lp.chapter_code !== chapterCode) continue;
    if (!progressByStudent.has(lp.student_name)) progressByStudent.set(lp.student_name, []);
    progressByStudent.get(lp.student_name)!.push({
      name: lp.course_name,
      rate: lp.progress_rate,
      done: lp.is_completed,
    });
  }

  const teamNumbers = Object.keys(teamMap)
    .map(Number)
    .sort((a, b) => a - b);

  if (teamNumbers.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          color: "#BBB",
          textAlign: "center",
          fontSize: 14,
        }}
      >
        이 챕터의 팀 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
        gap: 12,
      }}
    >
      {teamNumbers.map((teamNo) => {
        const memberNames = teamMap[String(teamNo)] ?? [];
        const members = memberNames
          .map((name) => studentMap.get(name))
          .filter((s): s is StudentSummary => s != null)
          .sort((a, b) => riskTotal(b) - riskTotal(a));

        const noDataNames = memberNames.filter(
          (name) => !studentMap.has(name)
        );

        const criticalCount = members.filter((s) => {
          const cs = chapterScores[s.student_name];
          return [
            cs?.comm_risk  ?? "없음",
            cs?.skill_risk ?? "없음",
            cs?.nps_risk   ?? "없음",
            cs?.ops_risk   ?? "없음",
          ].includes("심각");
        }).length;
        const hasCritical = criticalCount > 0;

        return (
          <div
            key={teamNo}
            style={{
              background: "#FFF",
              border: hasCritical ? "1px solid #FCA5A5" : "1px solid #E8E8E8",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {/* 팀 헤더 */}
            <div
              style={{
                padding: "10px 14px",
                background: hasCritical ? "#FEF2F2" : "#F8F8F8",
                borderBottom: "1px solid #E8E8E8",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {teamNo}팀
              </span>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 12,
                  color: "#888",
                }}
              >
                <span>{memberNames.length}명</span>
                {hasCritical && (
                  <span
                    style={{
                      color: "#DC2626",
                      fontWeight: 700,
                      fontSize: 11,
                      background: "#FEE2E2",
                      padding: "2px 7px",
                      borderRadius: 10,
                    }}
                  >
                    심각 {criticalCount}명
                  </span>
                )}
              </div>
            </div>

            {/* 팀원 목록 */}
            <div>
              {members.map((s, idx) => {
                const stat = statMap.get(s.student_name);
                const condScore = todayConditions.get(s.student_name);
                const total = riskTotal(s);
                const isLast =
                  idx === members.length - 1 && noDataNames.length === 0;

                const courses = progressByStudent.get(s.student_name) ?? [];
                // 이 챕터 다면평가 데이터가 있으면 표시, 없으면 "없음" (이전 챕터 데이터로 채우지 않음)
                const cs = chapterScores[s.student_name];
                const commRisk:  RiskLevel = cs?.comm_risk  ?? "없음";
                const skillRisk: RiskLevel = cs?.skill_risk ?? "없음";
                const npsRisk:   RiskLevel = cs?.nps_risk   ?? "없음";
                const opsRisk:   RiskLevel = cs?.ops_risk   ?? "없음";
                const chTotal = RISK_RANK[commRisk] + RISK_RANK[skillRisk] + RISK_RANK[npsRisk] + RISK_RANK[opsRisk];

                return (
                  <div
                    key={s.student_name}
                    style={{
                      padding: "9px 14px",
                      borderBottom: isLast ? "none" : "1px solid #F5F5F5",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {/* 이름+배지+막대 묶음 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {/* 이름 + 컨디션 */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 68 }}>
                          <Link
                            href={`${hrefPrefix}/${encodeURIComponent(s.student_name)}`}
                            style={{ fontWeight: 600, fontSize: 13, color: "#1A1A1A", textDecoration: "none" }}
                          >
                            {s.student_name}{chapterRoles[s.student_name] === "팀장" ? " 👑" : ""}
                          </Link>
                          {condScore != null && COND_EMOJI[condScore] && (
                            <span title="오늘 컨디션" style={{ fontSize: 13 }}>
                              {COND_EMOJI[condScore]}
                            </span>
                          )}
                        </div>

                        {/* 위험도 뱃지 */}
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", flex: 1 }}>
                          <RiskDot level={commRisk}  label="소통" />
                          <RiskDot level={skillRisk} label="실력" />
                          <RiskDot level={npsRisk}   label="NPS" />
                          <RiskDot level={opsRisk}   label="운영" />
                        </div>
                      </div>

                      {/* 수강률 막대 — 이름(68)+ 소통+실력 배지 너비까지 */}
                      {courses.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, maxWidth: 172 }}>
                          <span style={{ fontSize: 9, color: "#AAA", flexShrink: 0 }}>수강률</span>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                            {courses.map((c) => {
                              const pct = Math.round(c.rate);
                              const color = c.done ? "#10B981" : pct >= 80 ? "#3B82F6" : pct >= 40 ? "#F59E0B" : "#DC2626";
                              return (
                                <div
                                  key={c.name}
                                  title={`${c.name} ${pct}%`}
                                  style={{ width: "100%", height: 4, background: "#E5E7EB", borderRadius: 2, overflow: "hidden" }}
                                >
                                  <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 위험도 합산 */}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: chTotal >= 10 ? "#DC2626" : chTotal >= 7 ? "#F59E0B" : "#CCC",
                        minWidth: 18,
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {chTotal > 0 ? chTotal : ""}
                    </span>

                    {/* 면담 횟수 */}
                    {stat?.interview_count ? (
                      <span style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap", flexShrink: 0 }}>
                        면담 {stat.interview_count}회
                      </span>
                    ) : null}
                  </div>
                );
              })}

              {noDataNames.map((name, idx) => (
                <div
                  key={name}
                  style={{
                    padding: "9px 14px",
                    borderBottom:
                      idx < noDataNames.length - 1
                        ? "1px solid #F5F5F5"
                        : "none",
                    fontSize: 13,
                    color: "#BBB",
                  }}
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
