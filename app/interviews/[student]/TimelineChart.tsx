"use client";

import { NotionContent } from "./NotionContent";
import { CHAPTERS } from "../../../lib/curriculum";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
} from "recharts";

const CHAPTER_BG = [
  "#FAFAFA",
  "#F3F4F6",
  "#FAFAFA",
  "#F3F4F6",
  "#FAFAFA",
  "#F3F4F6",
  "#FAFAFA",
  "#F3F4F6",
  "#FAFAFA",
  "#F3F4F6",
];

type EvalPoint = {
  date: string;
  nps: number | null;
  ops: number | null;
  chapter: string | null;
  nps_comment: string | null;
  ops_comment: string | null;
};

type InterviewPoint = {
  date: string;
  types: string[];
  summary: string | null;
  content: string | null;
  chapter: string | null;
};

export type ConditionPoint = {
  date: string;
  score: number | null;
  content: string | null;
  contact_request: boolean;
};

export default function TimelineChart({
  evaluations,
  interviews,
  conditionLogs = [],
}: {
  evaluations: EvalPoint[];
  interviews: InterviewPoint[];
  conditionLogs?: ConditionPoint[];
}) {
  // 모든 날짜를 timestamp(ms)로 변환해 같은 축에 그림
  const toTs = (d: string) => new Date(d + "T00:00:00").getTime();

  // 데이터 시리즈
  const evalData = evaluations
    .filter((e) => e.nps != null || e.ops != null)
    .map((e) => ({
      ts: toTs(e.date),
      date: e.date,
      nps: e.nps,
      ops: e.ops,
      chapter: e.chapter,
      nps_comment: e.nps_comment,
      ops_comment: e.ops_comment,
      kind: "eval" as const,
    }));

  const intvData = interviews.map((iv) => ({
    ts: toTs(iv.date),
    date: iv.date,
    interview_y: 0,
    types: iv.types,
    summary: iv.summary,
    content: iv.content,
    chapter: iv.chapter,
    kind: "interview" as const,
  }));

  const condData = conditionLogs
    .filter((c) => c.score != null)
    .map((c) => ({
      ts: toTs(c.date),
      date: c.date,
      cond: c.score,
      content: c.content,
      contact_request: c.contact_request,
      kind: "condition" as const,
    }));

  // X축 도메인: 챕터 전체 기간
  const xMin = toTs(CHAPTERS[0].start);
  const xMax = toTs(CHAPTERS[CHAPTERS.length - 1].end);

  const hasCondition = condData.length > 0;

  if (evalData.length === 0 && condData.length === 0) {
    return (
      <div style={{ height: 380, display: "flex", alignItems: "center", justifyContent: "center", color: "#BBB", fontSize: 14 }}>
        평가 데이터 없음
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 380, marginBottom: 24 }}>
      <ResponsiveContainer>
        <ComposedChart margin={{ top: 16, right: hasCondition ? 48 : 24, bottom: 32, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEE" vertical={false} />

          {CHAPTERS.map((ch, i) => (
            <ReferenceArea
              key={ch.order}
              x1={toTs(ch.start)}
              x2={toTs(ch.end)}
              y1={0}
              y2={10}
              fill={CHAPTER_BG[i]}
              fillOpacity={0.5}
              ifOverflow="visible"
              label={{
                value: ch.name,
                position: "insideTop",
                fontSize: 11,
                fill: "#999",
              }}
            />
          ))}

          <XAxis
            type="number"
            dataKey="ts"
            domain={[xMin, xMax]}
            tickFormatter={(ts) => {
              const d = new Date(ts);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            ticks={CHAPTERS.map((c) => toTs(c.end))}
            tick={{ fontSize: 11, fill: "#666" }}
            stroke="#CCC"
            scale="time"
          />
          <YAxis
            yAxisId="main"
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            tick={{ fontSize: 11, fill: "#666" }}
            stroke="#CCC"
          />
          {hasCondition && (
            <YAxis
              yAxisId="cond"
              orientation="right"
              domain={[0, 4]}
              ticks={[0, 1, 2, 3, 4]}
              tick={{ fontSize: 10, fill: "#9CA3AF" }}
              stroke="#E5E7EB"
              tickFormatter={(v) => ["😰","😟","😐","😊","😄"][v] ?? v}
              width={32}
            />
          )}

          <Tooltip
            content={(props) => <CustomTooltip {...props} />}
            cursor={{ stroke: "#999", strokeDasharray: "3 3" }}
          />

          <Line
            data={evalData}
            yAxisId="main"
            type="monotone"
            dataKey="nps"
            stroke="#DC2626"
            strokeWidth={2.5}
            dot={{ r: 5, fill: "#DC2626", stroke: "#FFF", strokeWidth: 2 }}
            activeDot={{ r: 7 }}
            name="NPS"
            connectNulls
          />
          <Line
            data={evalData}
            yAxisId="main"
            type="monotone"
            dataKey="ops"
            stroke="#2563EB"
            strokeWidth={2.5}
            dot={{ r: 5, fill: "#2563EB", stroke: "#FFF", strokeWidth: 2 }}
            activeDot={{ r: 7 }}
            name="운영만족도"
            connectNulls
          />
          {hasCondition && (
            <Line
              data={condData}
              yAxisId="cond"
              type="monotone"
              dataKey="cond"
              stroke="#9CA3AF"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={{ r: 3, fill: "#9CA3AF", stroke: "#FFF", strokeWidth: 1.5 }}
              activeDot={{ r: 5 }}
              name="컨디션"
              connectNulls
            />
          )}

          {/* 면담 마커: y=0.5에 배치 */}
          <Scatter
            data={intvData.map((d) => ({ ...d, interview_y: 0.5 }))}
            yAxisId="main"
            dataKey="interview_y"
            fill="#10B981"
            shape={(props: { cx?: number; cy?: number }) => {
              if (props.cx == null || props.cy == null) return null;
              return (
                <g>
                  <line
                    x1={props.cx}
                    x2={props.cx}
                    y1={props.cy - 8}
                    y2={props.cy + 12}
                    stroke="#10B981"
                    strokeWidth={2}
                  />
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={6}
                    fill="#10B981"
                    stroke="#FFF"
                    strokeWidth={2}
                  />
                </g>
              );
            }}
            name="면담"
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div
        style={{
          display: "flex",
          gap: 20,
          justifyContent: "center",
          fontSize: 12,
          color: "#666",
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        <LegendDot color="#DC2626" label="NPS (좌축)" />
        <LegendDot color="#2563EB" label="운영만족도 (좌축)" />
        {hasCondition && <LegendDot color="#9CA3AF" label="컨디션 (우축 0–4)" dashed />}
        <LegendDot color="#10B981" label="면담" />
      </div>
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {dashed ? (
        <span style={{
          width: 18, height: 2,
          background: `repeating-linear-gradient(90deg,${color} 0,${color} 4px,transparent 4px,transparent 6px)`,
          display: "inline-block",
        }} />
      ) : (
        <span style={{
          width: 10, height: 10, borderRadius: 5,
          background: color, display: "inline-block",
        }} />
      )}
      <span>{label}</span>
    </div>
  );
}

type TooltipPayloadItem = {
  payload?: {
    kind?: 'eval' | 'interview' | 'condition';
    date: string;
    chapter?: string | null;
    nps?: number | null;
    ops?: number | null;
    nps_comment?: string | null;
    ops_comment?: string | null;
    cond?: number | null;
    content?: string | null;
    contact_request?: boolean;
    types?: string[];
    summary?: string | null;
  };
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: readonly TooltipPayloadItem[] }) {
  if (!active || !payload || !payload.length) return null;

  const p = payload[0]?.payload;
  if (!p) return null;

  const isInterview = p.kind === "interview";
  const isCondition = p.kind === "condition";
  const COND_LABEL = ["매우 힘들어요", "힘들어요", "보통", "좋아요", "아주 좋아요"];
  const COND_COLOR = ["#DC2626", "#F97316", "#FBBF24", "#84CC16", "#22C55E"];

  return (
    <div
      style={{
        background: "#FFF",
        border: "1px solid #E5E7EB",
        borderRadius: 6,
        padding: "10px 14px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        maxWidth: 360,
        fontSize: 13,
        color: "#1A1A1A",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "#666",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {p.date} {p.chapter ? `· ${p.chapter}` : ""}
      </div>

      {isCondition ? (
        <>
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#F97316", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              컨디션
            </span>
          </div>
          <div style={{ color: COND_COLOR[p.cond ?? 2], fontWeight: 700, fontSize: 15 }}>
            {COND_LABEL[p.cond ?? 2]}{" "}
            <span style={{ fontSize: 12, fontWeight: 400, color: "#888" }}>({p.cond}/4)</span>
          </div>
          {p.contact_request && (
            <div style={{ color: "#DC2626", marginTop: 4, fontWeight: 600, fontSize: 12 }}>🔔 상담 신청</div>
          )}
          {p.content && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 6, paddingTop: 6, borderTop: "1px solid #F0F0F0", whiteSpace: "pre-wrap", maxHeight: 120, overflow: "hidden", lineHeight: 1.5 }}>
              {p.content.slice(0, 200)}{p.content.length > 200 ? "…" : ""}
            </div>
          )}
        </>
      ) : isInterview ? (
        <>
          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#10B981",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              면담
            </span>
            {p.types && p.types.length > 0 && (
              <span style={{ marginLeft: 8, color: "#666", fontSize: 12 }}>
                {p.types.join(" · ")}
              </span>
            )}
          </div>
          {p.summary && (
            <div style={{ fontSize: 12, color: "#444", marginBottom: 4 }}>
              {p.summary}
            </div>
          )}
          {p.content && (
            <div
              style={{
                color: "#666",
                marginTop: 6,
                paddingTop: 6,
                borderTop: "1px solid #F0F0F0",
                maxHeight: 200,
                overflow: "hidden",
              }}
            >
              <NotionContent content={p.content} compact maxChars={400} />
            </div>
          )}
        </>
      ) : (
        <>
          {p.nps != null && (
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ color: "#DC2626", fontWeight: 700 }}>NPS</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{p.nps}</span>
              </div>
              {p.nps_comment && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#666",
                    marginTop: 4,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                  }}
                >
                  {p.nps_comment}
                </div>
              )}
            </div>
          )}
          {p.ops != null && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ color: "#2563EB", fontWeight: 700 }}>
                  운영만족도
                </span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{p.ops}</span>
              </div>
              {p.ops_comment && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#666",
                    marginTop: 4,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                  }}
                >
                  {p.ops_comment}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
