"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export type PeerComment = {
  id: number;
  evaluated_name: string;
  evaluator_name: string | null;
  chapter: string | null;
  team_no: number | null;
  comm_score: number | null;
  skill_score: number | null;
  comm_skill_comment: string | null;
  immerse_score: number | null;
  growth_score: number | null;
  immerse_growth_comment: string | null;
  submitted_at: string | null;
};

function avg(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n != null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function riskColor(score: number, max: number): string {
  const r = score / max;
  if (r < 0.5) return "#DC2626";
  if (r < 0.65) return "#F59E0B";
  if (r < 0.8) return "#3B82F6";
  return "#10B981";
}

function CommentBlock({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 2, letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap" }}>{body}</div>
    </div>
  );
}

export default function PeerChapterCard({
  chapter,
  received,
  given,
  roleMap = {},
}: {
  chapter: string;
  received: PeerComment[];
  given: PeerComment[];
  roleMap?: Record<string, string>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandTick, setExpandTick] = useState(0);
  const [collapseTick, setCollapseTick] = useState(0);

  const handleToggle = () => {
    if (isExpanded) {
      setIsExpanded(false);
      setCollapseTick((t) => t + 1);
    } else {
      setIsExpanded(true);
      setExpandTick((t) => t + 1);
    }
  };

  const teamNo = received[0]?.team_no ?? given[0]?.team_no;
  const avgComm = avg(received.map((p) => p.comm_score));
  const avgSkill = avg(received.map((p) => p.skill_score));
  const avgImmerse = avg(received.map((p) => p.immerse_score));
  const avgGrowth = avg(received.map((p) => p.growth_score));

  return (
    <div style={{ background: "#FFF", border: "1px solid #E8E8E8", borderLeft: "4px solid #8B5CF6", borderRadius: 8, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{chapter}</div>
          {teamNo && (
            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
              팀 {teamNo} · 받은 평가 {received.length}건 · 내가 준 평가 {given.length}건
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          {received.length > 0 && (
            <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
              {([["소통", avgComm], ["실력", avgSkill], ["몰입", avgImmerse], ["성장", avgGrowth]] as [string, number | null][]).map(([label, val]) => (
                <span key={label} style={{ color: val != null ? riskColor(val as number, 7) : "#BBB" }}>
                  {label} {val != null ? (val as number).toFixed(1) : "—"}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={handleToggle}
            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", color: "#666", whiteSpace: "nowrap" }}
          >
            {isExpanded ? "전체 접기" : "전체 펼치기"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#8B5CF6", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #EDE9FE" }}>
            받은 평가 ({received.length})
          </div>
          {received.length === 0 ? (
            <div style={{ fontSize: 12, color: "#BBB" }}>없음</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {received.map((p) => (
                <PeerRow
                  key={p.id}
                  peer={p}
                  nameRole="evaluator"
                  expandTick={expandTick}
                  collapseTick={collapseTick}
                  roleMap={roleMap}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#3B82F6", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #DBEAFE" }}>
            내가 준 평가 ({given.length})
          </div>
          {given.length === 0 ? (
            <div style={{ fontSize: 12, color: "#BBB" }}>없음</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {given.map((p) => (
                <PeerRow
                  key={p.id}
                  peer={p}
                  nameRole="evaluated"
                  expandTick={expandTick}
                  collapseTick={collapseTick}
                  roleMap={roleMap}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PeerRow({
  peer,
  nameRole,
  expandTick,
  collapseTick,
  roleMap = {},
}: {
  peer: PeerComment;
  nameRole: "evaluator" | "evaluated";
  expandTick: number;
  collapseTick: number;
  roleMap?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (expandTick > 0) setOpen(true);
  }, [expandTick]);

  useEffect(() => {
    if (collapseTick > 0) setOpen(false);
  }, [collapseTick]);

  const scores = [
    { label: "소통", val: peer.comm_score, max: 7 },
    { label: "실력", val: peer.skill_score, max: 7 },
    { label: "몰입", val: peer.immerse_score, max: 7 },
    { label: "성장", val: peer.growth_score, max: 7 },
  ];
  const hasComment = peer.comm_skill_comment || peer.immerse_growth_comment;
  const displayName = nameRole === "evaluator" ? peer.evaluator_name : peer.evaluated_name;
  const role = displayName && peer.chapter ? roleMap[`${displayName}||${peer.chapter}`] : null;

  return (
    <div style={{ background: "#FAFAFA", borderRadius: 6, border: "1px solid #F0F0F0" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 80 }}>
          {displayName ? (
            <Link
              href={`/${encodeURIComponent(displayName)}`}
              style={{ color: "#3B82F6", textDecoration: "none", fontSize: 13, fontWeight: 600 }}
              onClick={(e) => e.stopPropagation()}
            >
              {displayName}
            </Link>
          ) : <span style={{ fontSize: 13, fontWeight: 600 }}>?</span>}
          {role && (
            <span style={{
              fontSize: 10, padding: "1px 6px", borderRadius: 8, fontWeight: 600,
              background: role === "팀장" ? "#FEF3C7" : "#F3F4F6",
              color: role === "팀장" ? "#D97706" : "#6B7280",
            }}>
              {role}
            </span>
          )}
        </span>
        <div style={{ display: "flex", gap: 10, flex: 1, flexWrap: "wrap" }}>
          {scores.map(({ label, val, max }) => (
            <span key={label} style={{ fontSize: 12, color: val != null ? riskColor(val, max) : "#BBB" }}>
              {label} <strong>{val != null ? val.toFixed(1) : "—"}</strong>
            </span>
          ))}
        </div>
        {hasComment && (
          <span style={{ fontSize: 11, color: "#AAA" }}>{open ? "▲" : "▼"}</span>
        )}
      </div>
      {open && hasComment && (
        <div style={{ padding: "0 14px 12px 14px", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #F0F0F0" }}>
          {peer.comm_skill_comment && <CommentBlock label="소통/실력 코멘트" body={peer.comm_skill_comment} />}
          {peer.immerse_growth_comment && <CommentBlock label="몰입/성장 코멘트" body={peer.immerse_growth_comment} />}
        </div>
      )}
    </div>
  );
}
