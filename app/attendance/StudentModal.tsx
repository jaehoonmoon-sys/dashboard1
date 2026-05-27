"use client";

import { useEffect } from "react";

export type StudentRecord = {
  date: string;
  sheetType: string;
  sysStatus: string;
};

const TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  출석: { bg: "#DCFCE7", text: "#16A34A" },
  결석: { bg: "#FEE2E2", text: "#DC2626" },
  지각: { bg: "#FEF3C7", text: "#D97706" },
  공가: { bg: "#DBEAFE", text: "#2563EB" },
  조퇴: { bg: "#EDE9FE", text: "#7C3AED" },
  외출: { bg: "#D1FAE5", text: "#059669" },
  기록없음: { bg: "#F3F4F6", text: "#9CA3AF" },
};

// 대한민국 공휴일 — 공휴일 결석은 정상으로 처리
const HOLIDAYS: Record<string, string> = {
  // 2025
  "2025-01-01": "신정",
  "2025-01-28": "설날 연휴",
  "2025-01-29": "설날",
  "2025-01-30": "설날 연휴",
  "2025-03-01": "삼일절",
  "2025-03-03": "대체공휴일",
  "2025-05-05": "어린이날",
  "2025-05-06": "부처님오신날",
  "2025-06-06": "현충일",
  "2025-08-15": "광복절",
  "2025-10-03": "개천절",
  "2025-10-05": "추석 연휴",
  "2025-10-06": "추석",
  "2025-10-07": "추석 연휴",
  "2025-10-08": "대체공휴일",
  "2025-10-09": "한글날",
  "2025-12-25": "성탄절",
  // 2026
  "2026-01-01": "신정",
  "2026-01-28": "설날 연휴",
  "2026-01-29": "설날",
  "2026-01-30": "설날 연휴",
  "2026-03-01": "삼일절",
  "2026-03-02": "대체공휴일",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일",
  "2026-06-03": "지방선거",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
};

function SmallBadge({ label }: { label: string }) {
  if (label === "기록없음") {
    return <span style={{ fontSize: 9, color: "#D1D5DB", lineHeight: 1 }}>없음</span>;
  }
  const s = TYPE_STYLE[label] ?? { bg: "#F3F4F6", text: "#9CA3AF" };
  return (
    <span style={{
      fontSize: 9, padding: "1px 5px", borderRadius: 5, fontWeight: 700,
      background: s.bg, color: s.text, lineHeight: 1.4, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

export default function StudentModal({
  name,
  records,
  onClose,
}: {
  name: string;
  records: StudentRecord[];
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const byMonth = new Map<string, Map<string, StudentRecord>>();
  for (const r of records) {
    const m = r.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, new Map());
    byMonth.get(m)!.set(r.date, r);
  }
  const months = Array.from(byMonth.keys()).sort();

  // 요약 카운트 — 공휴일 날짜 제외
  const sheetCounts: Record<string, number> = {};
  for (const r of records) {
    if (!HOLIDAYS[r.date]) {
      sheetCounts[r.sheetType] = (sheetCounts[r.sheetType] ?? 0) + 1;
    }
  }
  const ORDER = ["출석", "지각", "조퇴", "결석", "공가", "외출", "기록없음"];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFF", borderRadius: 14, padding: "28px 28px 24px",
          maxWidth: 740, width: "92%", maxHeight: "88vh", overflowY: "auto",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3 }}>수강생 출결 캘린더</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>{name}</div>
          </div>
          <button
            onClick={onClose}
            style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: "4px 8px", lineHeight: 1 }}
          >✕</button>
        </div>

        {/* 요약 뱃지 (공휴일 제외) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {ORDER.filter((t) => sheetCounts[t] > 0).map((type) => {
            const s = TYPE_STYLE[type] ?? { bg: "#F3F4F6", text: "#9CA3AF" };
            return (
              <span key={type} style={{
                fontSize: 12, padding: "4px 12px", borderRadius: 20,
                background: s.bg, color: s.text, fontWeight: 600,
              }}>
                {type} {sheetCounts[type]}일
              </span>
            );
          })}
        </div>

        {/* 범례 */}
        <div style={{
          fontSize: 11, color: "#9CA3AF", marginBottom: 20, padding: "8px 12px",
          background: "#F9FAFB", borderRadius: 6, lineHeight: 1.6,
        }}>
          각 날짜 셀: <strong style={{ color: "#555" }}>위</strong> = PM시트 &nbsp;|&nbsp;
          <strong style={{ color: "#555" }}>아래</strong> = 시스템 &nbsp;|&nbsp;
          <span style={{
            background: "#EDE9FE", color: "#7C3AED",
            padding: "1px 6px", borderRadius: 4, fontWeight: 600, fontSize: 10, marginLeft: 2,
          }}>공휴일</span>
          {" "}= 결석 정상 처리
        </div>

        {/* 월별 캘린더 */}
        {months.map((month) => (
          <MonthGrid key={month} month={month} recordMap={byMonth.get(month)!} />
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ month, recordMap }: {
  month: string;
  recordMap: Map<string, StudentRecord>;
}) {
  const [year, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mo, 0).getDate();
  const firstDow = new Date(year, mo - 1, 1).getDay();
  const offset = (firstDow + 6) % 7;

  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 10 }}>
        {year}년 {mo}월
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {DAYS.map((d, i) => (
          <div key={d} style={{
            textAlign: "center", fontSize: 10, fontWeight: 700,
            color: i >= 5 ? "#F87171" : "#9CA3AF",
            paddingBottom: 6,
          }}>
            {d}
          </div>
        ))}

        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;

          const dateStr = `${month}-${String(day).padStart(2, "0")}`;
          const rec = recordMap.get(dateStr);
          const isWeekend = idx % 7 >= 5;
          const holidayName = HOLIDAYS[dateStr];
          const isHoliday = !!holidayName;

          // 기록 없는 주말 또는 공휴일
          if (!rec && (isWeekend || isHoliday)) {
            return (
              <div key={dateStr} style={{
                padding: "5px 3px 4px", minHeight: 54, borderRadius: 7,
                background: isHoliday && !isWeekend ? "#F5F3FF" : "transparent",
                border: isHoliday && !isWeekend ? "1px solid #DDD6FE" : "1px solid transparent",
                opacity: isWeekend && !isHoliday ? 0.3 : 1,
              }}>
                <div style={{
                  textAlign: "center", fontSize: 11, fontWeight: isHoliday ? 700 : 400,
                  color: isWeekend ? "#F87171" : "#7C3AED",
                }}>
                  {day}
                </div>
                {isHoliday && !isWeekend && (
                  <div style={{ textAlign: "center", fontSize: 8, color: "#8B5CF6", marginTop: 2, lineHeight: 1.2 }}>
                    공휴일
                  </div>
                )}
              </div>
            );
          }

          // 기록 없는 평일
          if (!rec) {
            return (
              <div key={dateStr} style={{
                padding: "5px 4px 5px", minHeight: 54, borderRadius: 7,
                background: "transparent", border: "1px solid transparent",
              }}>
                <div style={{ textAlign: "center", fontSize: 11, color: "#D1D5DB" }}>{day}</div>
              </div>
            );
          }

          // 공휴일 결석은 불일치로 처리하지 않음
          const isAbsent = rec.sheetType === "결석";
          const isDiscrepancy = isHoliday
            ? false
            : (rec.sheetType === "결석") !== (rec.sysStatus === "결석");

          return (
            <div
              key={dateStr}
              style={{
                padding: "5px 4px 5px",
                minHeight: 54,
                borderRadius: 7,
                background: isHoliday
                  ? "#F5F3FF"
                  : isDiscrepancy ? "#FEF2F2"
                  : isAbsent ? "#FEF2F2"
                  : "#FAFAFA",
                border: isHoliday
                  ? "1px solid #DDD6FE"
                  : isDiscrepancy ? "1px solid #FECACA"
                  : "1px solid #E5E7EB",
              }}
            >
              <div style={{
                textAlign: "center",
                fontSize: 11,
                color: isWeekend ? "#F87171" : isHoliday ? "#7C3AED" : "#374151",
                marginBottom: isHoliday ? 1 : 4,
                fontWeight: 600,
              }}>
                {day}
              </div>
              {isHoliday && (
                <div style={{ textAlign: "center", fontSize: 8, color: "#8B5CF6", marginBottom: 2, lineHeight: 1.1 }}>
                  공휴일
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                <SmallBadge label={rec.sheetType} />
                <SmallBadge label={rec.sysStatus} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
