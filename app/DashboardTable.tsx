"use client";

import { useState } from "react";
import Link from "next/link";

type RiskLevel = "낮음" | "중간" | "높음" | "심각" | "없음";

export type StudentSummary = {
  student_name: string;
  cohort: string;
  latest_chapter: string | null;
  latest_chapter_order: number;
  comm_risk: RiskLevel;
  skill_risk: RiskLevel;
  nps_risk: RiskLevel;
  ops_risk: RiskLevel;
  peer_communication: number | null;
  peer_skill: number | null;
  peer_growth: number | null;
  peer_immersion: number | null;
  nps_score: number | null;
  ops_satisfaction: number | null;
};

export type InterviewStat = {
  student_name: string;
  interview_count: number;
  last_interview_date: string | null;
  all_interview_types: string[] | null;
};

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

type SortKey = "name" | "comm" | "skill" | "nps" | "ops" | "interviews" | "risk_total";

function riskTotal(s: StudentSummary) {
  return RISK_RANK[s.comm_risk] + RISK_RANK[s.skill_risk] + RISK_RANK[s.nps_risk] + RISK_RANK[s.ops_risk];
}

const COND_EMOJI = ["😰", "😟", "😐", "😊", "😄"];

export default function DashboardTable({
  students,
  stats,
  hrefPrefix,
  todayConditions = new Map(),
}: {
  students: StudentSummary[];
  stats: InterviewStat[];
  hrefPrefix: string;
  todayConditions?: Map<string, number>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("risk_total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const statMap = new Map(stats.map((s) => [s.student_name, s]));

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const sorted = [...students].sort((a, b) => {
    let diff = 0;
    switch (sortKey) {
      case "name":
        diff = a.student_name.localeCompare(b.student_name, "ko");
        break;
      case "comm":
        diff = RISK_RANK[a.comm_risk] - RISK_RANK[b.comm_risk];
        break;
      case "skill":
        diff = RISK_RANK[a.skill_risk] - RISK_RANK[b.skill_risk];
        break;
      case "nps":
        diff = RISK_RANK[a.nps_risk] - RISK_RANK[b.nps_risk];
        break;
      case "ops":
        diff = RISK_RANK[a.ops_risk] - RISK_RANK[b.ops_risk];
        break;
      case "interviews": {
        const ca = statMap.get(a.student_name)?.interview_count ?? 0;
        const cb = statMap.get(b.student_name)?.interview_count ?? 0;
        diff = ca - cb;
        break;
      }
      case "risk_total":
      default:
        diff = riskTotal(a) - riskTotal(b);
        break;
    }
    return sortDir === "asc" ? diff : -diff;
  });

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ opacity: 0.25, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function SortableTh({
    col,
    children,
    center,
  }: {
    col: SortKey;
    children: React.ReactNode;
    center?: boolean;
  }) {
    const active = sortKey === col;
    return (
      <th
        onClick={() => handleSort(col)}
        style={{
          padding: "10px 14px",
          textAlign: center ? "center" : "left",
          fontWeight: 600,
          color: active ? "#1A1A1A" : "#666",
          cursor: "pointer",
          userSelect: "none",
          whiteSpace: "nowrap",
          position: "sticky",
          top: 0,
          background: "#F8F8F8",
          zIndex: 2,
          borderBottom: "1px solid #E8E8E8",
        }}
      >
        {children}
        <SortIcon col={col} />
      </th>
    );
  }

  return (
    <div
      style={{
        background: "#FFF",
        border: "1px solid #E8E8E8",
        borderRadius: 8,
        overflowY: "auto",
        maxHeight: "calc(100vh - 280px)",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#F8F8F8", fontSize: 13 }}>
            <SortableTh col="name">수강생 이름</SortableTh>
            <th
              style={{
                padding: "10px 14px",
                textAlign: "left",
                fontWeight: 600,
                color: "#666",
                position: "sticky",
                top: 0,
                background: "#F8F8F8",
                zIndex: 2,
                borderBottom: "1px solid #E8E8E8",
                whiteSpace: "nowrap",
              }}
            >
              기수
            </th>
            <SortableTh col="comm" center>소통</SortableTh>
            <SortableTh col="skill" center>실력</SortableTh>
            <SortableTh col="nps" center>NPS</SortableTh>
            <SortableTh col="ops" center>운영만족도</SortableTh>
            <SortableTh col="interviews">면담 내역</SortableTh>
            <SortableTh col="risk_total" center>위험도 합산</SortableTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const stat = statMap.get(s.student_name);
            return (
              <tr
                key={s.student_name + s.cohort}
                style={{ borderTop: "1px solid #F0F0F0" }}
              >
                <td style={{ padding: "12px 14px", fontSize: 14 }}>
                  <Link
                    href={`${hrefPrefix}/${encodeURIComponent(s.student_name)}`}
                    style={{
                      color: "#1A1A1A",
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                  >
                    {s.student_name}
                  </Link>
                  {todayConditions.has(s.student_name) && (
                    <span
                      title={`오늘 컨디션: ${COND_EMOJI[todayConditions.get(s.student_name)!]}`}
                      style={{ marginLeft: 6, fontSize: 15 }}
                    >
                      {COND_EMOJI[todayConditions.get(s.student_name)!]}
                    </span>
                  )}
                </td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: "#666" }}>
                  디마 5기
                </td>
                <td style={{ padding: "12px 14px", textAlign: "center" }}>
                  <RiskBadge level={s.comm_risk} />
                </td>
                <td style={{ padding: "12px 14px", textAlign: "center" }}>
                  <RiskBadge level={s.skill_risk} />
                </td>
                <td style={{ padding: "12px 14px", textAlign: "center" }}>
                  <RiskBadge level={s.nps_risk} />
                </td>
                <td style={{ padding: "12px 14px", textAlign: "center" }}>
                  <RiskBadge level={s.ops_risk} />
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <InterviewCell stat={stat} />
                </td>
                <td style={{ padding: "12px 14px", textAlign: "center" }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: riskTotal(s) >= 10 ? "#DC2626" : riskTotal(s) >= 7 ? "#F59E0B" : "#666",
                    }}
                  >
                    {riskTotal(s)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const color = RISK_COLOR[level];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 12,
        background: `${color}1A`,
        color,
        fontSize: 12,
        fontWeight: 600,
        minWidth: 38,
      }}
    >
      {level}
    </span>
  );
}

function InterviewCell({ stat }: { stat: InterviewStat | undefined }) {
  if (!stat || !stat.interview_count) {
    return <span style={{ color: "#BBB", fontSize: 12 }}>—</span>;
  }
  const types = (stat.all_interview_types ?? []).slice(0, 3).join(" · ");
  return (
    <div style={{ fontSize: 12 }}>
      <span style={{ fontWeight: 600, color: "#1A1A1A" }}>
        {stat.interview_count}회
      </span>
      <span style={{ color: "#999", marginLeft: 8 }}>{types}</span>
    </div>
  );
}
