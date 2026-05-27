"use client";

import { useState, useMemo, Fragment } from "react";
import StudentModal from "./StudentModal";

export type StudentDay = {
  student_name: string;
  sheetType: string;
  sysStatus: string;
  isDiscrepancy: boolean;
};

export type DayComparison = {
  date: string;
  sheetTotal: number;
  sheetAbsent: number;
  sheetRate: number;
  sysTotal: number;
  sysAbsent: number;
  sysRate: number;
  delta: number;
  hasSystemData: boolean;
  students: StudentDay[];
};

type SortKey = "date" | "sheetRate" | "sysRate" | "delta";

const TYPE_COLOR: Record<string, string> = {
  결석: "#DC2626",
  지각: "#F59E0B",
  조퇴: "#8B5CF6",
  공가: "#3B82F6",
  외출: "#10B981",
  출석: "#6B7280",
  기록없음: "#D1D5DB",
};

const TYPE_ORDER = ["출석", "지각", "조퇴", "결석", "공가", "외출", "기록없음"];
const SIDE_TYPES = ["지각", "조퇴", "공가", "외출"];

function TypeBadge({ label }: { label: string }) {
  const color = TYPE_COLOR[label] ?? "#9CA3AF";
  return (
    <span style={{
      fontSize: 11, padding: "2px 7px", borderRadius: 10, fontWeight: 600,
      background: `${color}1A`, color, border: `1px solid ${color}40`,
    }}>
      {label}
    </span>
  );
}

export default function DiscrepancyTable({ data }: { data: DayComparison[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [filterDiscrepancy, setFilterDiscrepancy] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const studentHistory = useMemo(() => {
    const map = new Map<string, { date: string; sheetType: string; sysStatus: string }[]>();
    for (const day of data) {
      for (const s of day.students) {
        if (!map.has(s.student_name)) map.set(s.student_name, []);
        map.get(s.student_name)!.push({ date: day.date, sheetType: s.sheetType, sysStatus: s.sysStatus });
      }
    }
    for (const records of map.values()) {
      records.sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [data]);

  const rangeData = useMemo(() => {
    if (!fromDate && !toDate) return null;
    return data.filter(d => {
      if (fromDate && d.date < fromDate) return false;
      if (toDate && d.date > toDate) return false;
      return true;
    });
  }, [data, fromDate, toDate]);

  const rangeStats = useMemo(() => {
    if (!rangeData) return null;

    const sheetDays = rangeData.filter(d => d.sheetTotal > 0);
    const totalSheet = sheetDays.reduce((s, d) => s + d.sheetTotal, 0);
    const totalSheetAbsent = sheetDays.reduce((s, d) => s + d.sheetAbsent, 0);

    const sysDays = rangeData.filter(d => d.hasSystemData);
    const totalSys = sysDays.reduce((s, d) => s + d.sysTotal, 0);
    const totalSysAbsent = sysDays.reduce((s, d) => s + d.sysAbsent, 0);

    const typeCounts: Record<string, number> = {};
    for (const day of rangeData) {
      for (const s of day.students) {
        if (s.sheetType !== "기록없음") {
          typeCounts[s.sheetType] = (typeCounts[s.sheetType] ?? 0) + 1;
        }
      }
    }
    const totalTypeRecords = Object.values(typeCounts).reduce((a, b) => a + b, 0);

    const absentMap = new Map<string, string[]>();
    for (const day of rangeData) {
      for (const s of day.students) {
        if (s.sheetType === "결석") {
          if (!absentMap.has(s.student_name)) absentMap.set(s.student_name, []);
          absentMap.get(s.student_name)!.push(day.date);
        }
      }
    }
    const absentStudents = Array.from(absentMap.entries())
      .map(([name, dates]) => ({ name, dates: dates.sort() }))
      .sort((a, b) => b.dates.length - a.dates.length);

    return {
      sheetDays: sheetDays.length,
      totalSheet,
      totalSheetAbsent,
      sheetAbsenceRate: totalSheet > 0 ? (totalSheetAbsent / totalSheet) * 100 : 0,
      totalSys,
      totalSysAbsent,
      sysAbsenceRate: totalSys > 0 ? (totalSysAbsent / totalSys) * 100 : 0,
      typeCounts,
      totalTypeRecords,
      absentStudents,
    };
  }, [rangeData]);

  const sorted = [...data].sort((a, b) => {
    const diff = a[sortKey] < b[sortKey] ? -1 : a[sortKey] > b[sortKey] ? 1 : 0;
    return sortAsc ? diff : -diff;
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function SortHeader({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col;
    return (
      <th
        onClick={() => handleSort(col)}
        style={{
          padding: "10px 14px", textAlign: "right", cursor: "pointer",
          fontSize: 12, fontWeight: 600, color: active ? "#1A1A1A" : "#666",
          whiteSpace: "nowrap", userSelect: "none",
        }}
      >
        {label} {active ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  const hasRange = fromDate || toDate;

  return (
    <>
      {selectedStudent && (
        <StudentModal
          name={selectedStudent}
          records={studentHistory.get(selectedStudent) ?? []}
          onClose={() => setSelectedStudent(null)}
        />
      )}

      {/* 기간 설정 */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #E8E8E8", background: "#FAFAFA" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>기간 설정</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #D1D5DB", borderRadius: 6, color: "#374151" }}
          />
          <span style={{ color: "#9CA3AF", fontSize: 13 }}>~</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #D1D5DB", borderRadius: 6, color: "#374151" }}
          />
          {hasRange && (
            <button
              onClick={() => { setFromDate(""); setToDate(""); }}
              style={{
                fontSize: 11, padding: "4px 10px", border: "1px solid #D1D5DB",
                borderRadius: 12, cursor: "pointer", background: "#FFF", color: "#6B7280",
              }}
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 기간 요약 패널 */}
      {rangeStats && (
        <div style={{ padding: "16px 20px", borderBottom: "2px solid #DBEAFE", background: "#EFF6FF" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8", marginBottom: 14 }}>
            {fromDate && toDate
              ? `${fromDate.slice(5)} ~ ${toDate.slice(5)}`
              : fromDate ? `${fromDate.slice(5)} 이후`
              : `${toDate.slice(5)} 이전`
            } 기간 요약 · {rangeStats.sheetDays}일
          </div>

          {/* 결석률 카드 */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ background: "#FFF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "10px 16px", minWidth: 150 }}>
              <div style={{ fontSize: 11, color: "#3B82F6", marginBottom: 2, fontWeight: 600 }}>PM시트 결석률</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1D4ED8", lineHeight: 1.1 }}>
                {rangeStats.sheetAbsenceRate.toFixed(1)}%
              </div>
              <div style={{ fontSize: 10, color: "#93C5FD", marginTop: 3 }}>
                {rangeStats.totalSheetAbsent} / {rangeStats.totalSheet} 건
              </div>
            </div>
            <div style={{ background: "#FFF", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 16px", minWidth: 150 }}>
              <div style={{ fontSize: 11, color: "#D97706", marginBottom: 2, fontWeight: 600 }}>시스템 결석률</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#B45309", lineHeight: 1.1 }}>
                {rangeStats.sysAbsenceRate.toFixed(1)}%
              </div>
              <div style={{ fontSize: 10, color: "#FCD34D", marginTop: 3 }}>
                {rangeStats.totalSysAbsent} / {rangeStats.totalSys} 건
              </div>
            </div>
          </div>

          {/* 유형별 비율 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
              유형별 비율 (PM시트 기준)
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TYPE_ORDER.filter(t => t !== "기록없음" && (rangeStats.typeCounts[t] ?? 0) > 0).map(type => {
                const count = rangeStats.typeCounts[type] ?? 0;
                const pct = rangeStats.totalTypeRecords > 0 ? (count / rangeStats.totalTypeRecords) * 100 : 0;
                const color = TYPE_COLOR[type] ?? "#9CA3AF";
                return (
                  <div key={type} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: `${color}1A`, border: `1px solid ${color}40`,
                    borderRadius: 8, padding: "7px 12px",
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{type}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color }}>{pct.toFixed(1)}%</span>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{count}건</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 결석 수강생 목록 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
              기간 내 결석 수강생 ({rangeStats.absentStudents.length}명)
            </div>
            {rangeStats.absentStudents.length === 0 ? (
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>결석 기록 없음</div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 6,
                maxHeight: 300,
                overflowY: "auto",
              }}>
                {rangeStats.absentStudents.map(({ name, dates }) => (
                  <div
                    key={name}
                    onClick={() => setSelectedStudent(name)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      padding: "8px 10px", borderRadius: 7,
                      background: "#FEF2F2", border: "1px solid #FECACA",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      fontWeight: 600, fontSize: 12, minWidth: 80, color: "#1D4ED8",
                      textDecoration: "underline", textDecorationStyle: "dotted",
                      textDecorationColor: "#93C5FD", flexShrink: 0,
                    }}>
                      {name}
                    </span>
                    <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 700, flexShrink: 0 }}>
                      {dates.length}일
                    </span>
                    <span style={{ fontSize: 10, color: "#9CA3AF", lineHeight: 1.6 }}>
                      {dates.map(d => d.slice(5)).join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 날짜별 테이블 */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #E8E8E8", background: "#FAFAFA" }}>
              <SortHeader col="date" label="날짜" />
              <th style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#666", textAlign: "right" }}>
                시트 결석
              </th>
              <SortHeader col="sheetRate" label="시트 결석률" />
              <th style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#666", textAlign: "right" }}>
                시스템 결석
              </th>
              <SortHeader col="sysRate" label="시스템 결석률" />
              <SortHeader col="delta" label="차이" />
              <th style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#666", textAlign: "center" }}>
                불일치
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isExpanded = expandedDate === row.date;
              const discrepancyCount = row.students.filter((s) => s.isDiscrepancy).length;
              const hasDiscrepancy = discrepancyCount > 0;
              const deltaColor = row.delta > 10 ? "#DC2626" : row.delta > 5 ? "#F59E0B" : row.delta > 0 ? "#666" : "#BBB";
              const displayStudents = filterDiscrepancy
                ? row.students.filter((s) => s.isDiscrepancy)
                : row.students;

              // 결석 외 유형 요약 (지각·조퇴·공가·외출)
              const typeSummary = SIDE_TYPES
                .map(type => ({ type, count: row.students.filter(s => s.sheetType === type).length }))
                .filter(({ count }) => count > 0);

              return (
                <Fragment key={row.date}>
                  <tr
                    onClick={() => setExpandedDate(isExpanded ? null : row.date)}
                    style={{
                      borderBottom: isExpanded ? "none" : "1px solid #F0F0F0",
                      background: isExpanded ? "#F0F7FF" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "12px 14px", fontWeight: 600, color: "#1A1A1A", whiteSpace: "nowrap" }}>
                      {row.date.slice(5)} {isExpanded ? "▲" : "▼"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: "#2563EB" }}>
                      <div>{row.sheetAbsent}<span style={{ color: "#BBB", fontSize: 11 }}>/{row.sheetTotal}</span></div>
                      {typeSummary.length > 0 && (
                        <div style={{ marginTop: 3 }}>
                          {typeSummary.map(({ type, count }) => (
                            <span key={type} style={{
                              fontSize: 10, marginLeft: 3,
                              color: TYPE_COLOR[type] ?? "#888",
                              fontWeight: 600,
                            }}>
                              {type} {count}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: "#2563EB", fontWeight: 600 }}>
                      {row.sheetRate.toFixed(1)}%
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: row.hasSystemData ? "#F59E0B" : "#CCC" }}>
                      {row.hasSystemData
                        ? <>{row.sysAbsent}<span style={{ color: "#BBB", fontSize: 11 }}>/{row.sysTotal}</span></>
                        : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", color: row.hasSystemData ? "#F59E0B" : "#CCC", fontWeight: 600 }}>
                      {row.hasSystemData ? `${row.sysRate.toFixed(1)}%` : <span style={{ fontSize: 11 }}>시스템 없음</span>}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, color: deltaColor }}>
                      {row.hasSystemData && row.delta > 0 ? `${row.delta.toFixed(1)}%p` : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center", color: hasDiscrepancy ? "#DC2626" : "#BBB" }}>
                      {hasDiscrepancy ? `${discrepancyCount}명` : "—"}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ borderBottom: "2px solid #BFDBFE", background: "#F0F7FF" }}>
                      <td colSpan={7} style={{ padding: "12px 16px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                          <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>{row.date} 출결 현황</span>
                          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setFilterDiscrepancy(false); }}
                              style={{
                                fontSize: 11, padding: "3px 11px", borderRadius: 12, cursor: "pointer",
                                background: !filterDiscrepancy ? "#1D4ED8" : "#E5E7EB",
                                color: !filterDiscrepancy ? "#FFF" : "#555",
                                border: "none", fontWeight: 600,
                              }}
                            >
                              전체 {row.students.length}명
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setFilterDiscrepancy(true); }}
                              style={{
                                fontSize: 11, padding: "3px 11px", borderRadius: 12, cursor: "pointer",
                                background: filterDiscrepancy ? "#DC2626" : "#E5E7EB",
                                color: filterDiscrepancy ? "#FFF" : "#555",
                                border: "none", fontWeight: 600,
                              }}
                            >
                              불일치 {discrepancyCount}명
                            </button>
                          </div>
                        </div>
                        {displayStudents.length === 0 ? (
                          <div style={{ fontSize: 13, color: "#999", padding: "8px 0" }}>불일치 학생 없음</div>
                        ) : (
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                            gap: 6,
                          }}>
                            {displayStudents.map((s) => (
                              <div
                                key={s.student_name}
                                onClick={(e) => { e.stopPropagation(); setSelectedStudent(s.student_name); }}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8,
                                  padding: "7px 10px", borderRadius: 7,
                                  background: s.isDiscrepancy ? "#FEF2F2" : "#FFFFFF",
                                  border: s.isDiscrepancy ? "1px solid #FECACA" : "1px solid #E5E7EB",
                                  cursor: "pointer",
                                  transition: "box-shadow 0.1s",
                                }}
                              >
                                <span style={{
                                  fontWeight: 600, fontSize: 12, minWidth: 72, color: "#1D4ED8",
                                  textDecoration: "underline", textDecorationStyle: "dotted",
                                  textDecorationColor: "#93C5FD", flexShrink: 0,
                                }}>
                                  {s.student_name}
                                </span>
                                <span style={{ fontSize: 10, color: "#9CA3AF", flexShrink: 0 }}>PM</span>
                                <TypeBadge label={s.sheetType} />
                                {row.hasSystemData && (
                                  <>
                                    <span style={{ color: "#D1D5DB", fontSize: 10, flexShrink: 0 }}>→</span>
                                    <span style={{ fontSize: 10, color: "#9CA3AF", flexShrink: 0 }}>시스템</span>
                                    <TypeBadge label={s.sysStatus} />
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
