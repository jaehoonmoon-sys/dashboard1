"use client";

import { useState } from "react";

export type ConditionLog = {
  score: number | null;
  content: string | null;
  contact_request: boolean;
  logged_at: string | null;
};

const SCORE_COLOR = ["#DC2626", "#F97316", "#FBBF24", "#84CC16", "#22C55E"];
const SCORE_LABEL = ["매우 힘들어요", "힘들어요", "보통", "좋아요", "아주 좋아요"];

function deriveMonths(logs: ConditionLog[]): { year: number; month: number }[] {
  const yearMonths = logs
    .filter((l) => l.logged_at)
    .map((l) => l.logged_at!.slice(0, 7));
  if (yearMonths.length === 0) return [];
  const uniq = [...new Set(yearMonths)].sort();
  const [minY, minM] = uniq[0].split("-").map(Number);
  const [maxY, maxM] = uniq[uniq.length - 1].split("-").map(Number);
  const result: { year: number; month: number }[] = [];
  let y = minY, m = minM;
  while (y < maxY || (y === maxY && m <= maxM)) {
    result.push({ year: y, month: m });
    if (++m > 12) { m = 1; y++; }
  }
  return result;
}

export default function ConditionCalendar({ logs }: { logs: ConditionLog[] }) {
  const months = deriveMonths(logs);
  const [tooltip, setTooltip] = useState<{
    dateStr: string;
    log: ConditionLog;
    x: number;
    y: number;
  } | null>(null);

  const logMap = new Map<string, ConditionLog>();
  for (const log of logs) {
    if (log.logged_at) {
      logMap.set(log.logged_at.slice(0, 10), log);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      {/* 범례 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {[0, 1, 2, 3, 4].map((s) => (
          <span
            key={s}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#555" }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: SCORE_COLOR[s],
                display: "inline-block",
              }}
            />
            {SCORE_LABEL[s]}
          </span>
        ))}
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#555" }}>
          <span style={{
            width: 10, height: 10, borderRadius: 2,
            background: "#E5E7EB", display: "inline-block",
          }} />
          기록 없음
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#555" }}>
          <span style={{
            position: "relative", width: 10, height: 10, borderRadius: 2,
            background: "#22C55E", display: "inline-block", flexShrink: 0,
          }}>
            <span style={{ position: "absolute", top: 1, right: 1, width: 3, height: 3, borderRadius: "50%", background: "#FFF" }} />
          </span>
          흰 점 = 상담 신청
        </span>
      </div>

      {logs.length === 0 && (
        <p style={{ color: "#BBB", fontSize: 13 }}>
          컨디션 데이터 없음 (수강생-ID 매핑 후 표시됩니다)
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {months.map(({ year, month }) => (
          <MonthGrid
            key={`${year}-${month}`}
            year={year}
            month={month}
            logMap={logMap}
            onHover={(dateStr, log, x, y) => setTooltip({ dateStr, log, x, y })}
            onLeave={() => setTooltip(null)}
          />
        ))}
      </div>

      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 8,
            top: tooltip.y,
            background: "#FFF",
            border: "1px solid #E5E7EB",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            color: "#1A1A1A",
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
            maxWidth: 220,
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, color: "#555" }}>
            {tooltip.dateStr}
          </div>
          <div style={{ color: SCORE_COLOR[tooltip.log.score ?? 2], fontWeight: 600 }}>
            {SCORE_LABEL[tooltip.log.score ?? 2]}{" "}
            <span style={{ fontWeight: 400, color: "#888" }}>
              ({tooltip.log.score}/4)
            </span>
          </div>
          {tooltip.log.contact_request && (
            <div style={{ color: "#DC2626", marginTop: 4, fontWeight: 600, fontSize: 11 }}>
              🔔 상담 신청
            </div>
          )}
          {tooltip.log.content && (
            <div
              style={{
                marginTop: 6,
                color: "#444",
                borderTop: "1px solid #F0F0F0",
                paddingTop: 6,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {tooltip.log.content.slice(0, 150)}
              {tooltip.log.content.length > 150 ? "…" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MonthGrid({
  year,
  month,
  logMap,
  onHover,
  onLeave,
}: {
  year: number;
  month: number;
  logMap: Map<string, ConditionLog>;
  onHover: (dateStr: string, log: ConditionLog, x: number, y: number) => void;
  onLeave: () => void;
}) {
  const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#777", marginBottom: 4 }}>
        {year}년 {month}월
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {WEEK_LABELS.map((d) => (
          <div
            key={d}
            style={{ fontSize: 9, color: "#AAA", textAlign: "center", paddingBottom: 2 }}
          >
            {d}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const log = logMap.get(dateStr);
          const bg = log != null ? SCORE_COLOR[log.score ?? 2] : "#E5E7EB";

          return (
            <div
              key={idx}
              title={log ? `${SCORE_LABEL[log.score ?? 2]}` : undefined}
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: 3,
                background: bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: log ? "#FFF" : "#CCC",
                fontWeight: log ? 700 : 400,
                cursor: log ? "pointer" : "default",
                position: "relative",
              }}
              onMouseEnter={
                log
                  ? (e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = rect.right + 236 > window.innerWidth ? rect.left - 244 : rect.right;
                      const tooltipH = 180;
                      const y = rect.top + tooltipH > window.innerHeight ? rect.top - tooltipH : rect.top;
                      onHover(dateStr, log, x, y);
                    }
                  : undefined
              }
              onMouseLeave={log ? onLeave : undefined}
            >
              {day}
              {log?.contact_request && (
                <span
                  style={{
                    position: "absolute",
                    top: 1,
                    right: 1,
                    width: 3,
                    height: 3,
                    borderRadius: "50%",
                    background: "#FFF",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
