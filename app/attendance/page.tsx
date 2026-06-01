import { supabase } from "../../lib/supabase";
import AttendanceChart, { ChartPoint } from "./AttendanceChart";
import DiscrepancyTable, { DayComparison } from "./DiscrepancyTable";

export const dynamic = "force-dynamic";

const COHORT = "AI 기반 디지털 마케팅 부트캠프 5회차";
const PAGE_SIZE = 1000;

// Supabase REST API 기본 제한(1000건)을 넘는 경우 페이지네이션으로 전체 조회
async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export default async function Page() {
  const today = new Date().toISOString().slice(0, 10);

  const [sheetRows, sysRows] = await Promise.all([
    fetchAllPages<{ date: string; type: string; student_name: string }>((from, to) =>
      supabase
        .from("mj_attendance")
        .select("date, type, student_name")
        .lte("date", today)
        .order("date")
        .range(from, to)
    ),
    fetchAllPages<{ date: string; status: string; student_name: string }>((from, to) =>
      supabase
        .from("mj_attendance_log")
        .select("date, status, student_name")
        .eq("cohort", COHORT)
        .lte("date", today)
        .order("date")
        .range(from, to)
    ),
  ]);

  // Group by date
  const sheetByDate = new Map<string, typeof sheetRows>();
  for (const row of sheetRows) {
    if (!sheetByDate.has(row.date)) sheetByDate.set(row.date, []);
    sheetByDate.get(row.date)!.push(row);
  }

  const sysByDate = new Map<string, typeof sysRows>();
  for (const row of sysRows) {
    if (!sysByDate.has(row.date)) sysByDate.set(row.date, []);
    sysByDate.get(row.date)!.push(row);
  }

  // Union of all dates from both sources
  const dates = Array.from(new Set([...sheetByDate.keys(), ...sysByDate.keys()])).sort();

  const comparisons: DayComparison[] = dates.map((date) => {
    const sheetOnDate = sheetByDate.get(date) ?? [];
    const sysOnDate = sysByDate.get(date) ?? [];

    const sheetTotal = sheetOnDate.length;
    const sheetAbsent = sheetOnDate.filter((r) => r.type === "결석").length;
    const sheetRate = sheetTotal > 0 ? (sheetAbsent / sheetTotal) * 100 : 0;

    const sysTotal = sysOnDate.length;
    const sysAbsent = sysOnDate.filter((r) => r.status === "결석").length;
    const sysRate = sysTotal > 0 ? (sysAbsent / sysTotal) * 100 : 0;

    const hasSystemData = sysTotal > 0;
    const delta = sheetTotal > 0 && hasSystemData ? Math.abs(sheetRate - sysRate) : 0;

    const sheetMap = new Map(sheetOnDate.map((r) => [r.student_name, r.type]));
    const sysMap = new Map(sysOnDate.map((r) => [r.student_name, r.status]));

    const allStudentNames = new Set([...sheetMap.keys(), ...sysMap.keys()]);
    const students: DayComparison["students"] = [];
    for (const name of allStudentNames) {
      const sheetType = sheetMap.get(name) ?? "기록없음";
      const sysStatus = sysMap.get(name) ?? "기록없음";
      const isDiscrepancy = (sheetType === "결석") !== (sysStatus === "결석");
      students.push({ student_name: name ?? "", sheetType, sysStatus, isDiscrepancy });
    }
    students.sort((a, b) => a.student_name.localeCompare(b.student_name));

    return { date, sheetTotal, sheetAbsent, sheetRate, sysTotal, sysAbsent, sysRate, delta, hasSystemData, students };
  });

  // 차트: 두 소스 모두 있는 날짜만
  const chartData: ChartPoint[] = comparisons
    .filter((c) => c.hasSystemData && c.sheetTotal > 0)
    .map((c) => ({
      date: c.date,
      sheetAbsent: c.sheetAbsent,
      sysAbsent: c.sysAbsent,
    }));

  // 요약 통계: 비교 가능 날짜 기준
  const comparableDays = comparisons.filter((c) => c.hasSystemData && c.sheetTotal > 0);
  const avgSheetRate = comparableDays.length > 0
    ? comparableDays.reduce((s, c) => s + c.sheetRate, 0) / comparableDays.length
    : 0;
  const avgSysRate = comparableDays.length > 0
    ? comparableDays.reduce((s, c) => s + c.sysRate, 0) / comparableDays.length
    : 0;
  const maxDeltaDay = comparableDays.length > 0
    ? comparableDays.reduce((a, b) => (a.delta > b.delta ? a : b))
    : null;
  const totalDiscrepancyDays = comparisons.filter((c) => c.students.some((s) => s.isDiscrepancy)).length;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px" }}>
      <header style={{ marginBottom: 32 }}>
        <a href="/" style={{ fontSize: 12, color: "#999", textDecoration: "none", display: "block", marginBottom: 8 }}>← 메인</a>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>📋 출결 비교 분석</h1>
        <p style={{ color: "#666", marginTop: 8, marginBottom: 0 }}>
          PM 시트(구글) vs 시스템(리대시) · 전체 {comparisons.length}일 · 비교 가능 {comparableDays.length}일 · 기준: 결석 여부
        </p>
      </header>

      {/* 요약 카드 */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 36 }}>
        <StatCard label="PM 시트 평균 결석률" value={`${avgSheetRate.toFixed(1)}%`} accent="#2563EB" sub={`비교 가능 ${comparableDays.length}일 기준`} />
        <StatCard label="시스템 평균 결석률" value={`${avgSysRate.toFixed(1)}%`} accent="#F59E0B" sub={`비교 가능 ${comparableDays.length}일 기준`} />
        <StatCard
          label="최대 차이 날짜"
          value={maxDeltaDay ? maxDeltaDay.date.slice(5) : "—"}
          sub={maxDeltaDay ? `${maxDeltaDay.delta.toFixed(1)}%p 차이` : undefined}
          accent="#DC2626"
        />
        <StatCard label="불일치 발생일" value={`${totalDiscrepancyDays}일`} accent="#8B5CF6" />
      </section>

      {comparisons.length === 0 && (
        <p style={{ color: "#BBB", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
          출결 데이터 없음
        </p>
      )}

      {/* 차트 */}
      <section style={{ background: "#FFF", border: "1px solid #E8E8E8", borderRadius: 8, padding: "20px 16px 16px", marginBottom: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>일별 결석인원 추이 (비교 가능 날짜)</h2>
        <AttendanceChart data={chartData} />
      </section>

      {/* 상세 테이블 */}
      <section style={{ background: "#FFF", border: "1px solid #E8E8E8", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8E8" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>날짜별 상세</h2>
          <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0" }}>
            날짜 클릭 → 당일 전체 수강생 출결 확인 · 수강생 이름 클릭 → 개인 출결 캘린더
          </p>
        </div>
        <DiscrepancyTable data={comparisons} />
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div style={{ background: "#FFF", border: "1px solid #E8E8E8", borderRadius: 8, padding: "20px 24px" }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
