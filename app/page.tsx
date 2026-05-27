import Link from "next/link";
import RefreshButton from "./RefreshButton";

export default function Page() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 56 }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 700, margin: 0 }}>디마 5기 대시보드</h1>
          <p style={{ color: "#666", marginTop: 10, marginBottom: 0, fontSize: 15 }}>
            AI 기반 디지털 마케팅 부트캠프 5회차
          </p>
        </div>
        <RefreshButton />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <NavCard
          href="/interviews"
          emoji="🎯"
          title="면담 관리"
          description="저성과자 면담 현황 및 위험도 추적"
          accent="#3B82F6"
        />
        <NavCard
          href="/attendance"
          emoji="📋"
          title="출결 분석"
          description="PM 시트 vs 시스템 출결 비교 분석"
          accent="#10B981"
        />
      </div>
    </main>
  );
}

function NavCard({
  href,
  emoji,
  title,
  description,
  accent,
}: {
  href: string;
  emoji: string;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "32px 28px",
        background: "#FFF",
        border: "1px solid #E8E8E8",
        borderTop: `4px solid ${accent}`,
        borderRadius: 10,
        textDecoration: "none",
        color: "inherit",
        transition: "box-shadow 0.15s",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>{emoji}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14, color: "#666", lineHeight: 1.5 }}>{description}</div>
    </Link>
  );
}
