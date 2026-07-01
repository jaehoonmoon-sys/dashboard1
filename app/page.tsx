import Link from "next/link";

const TRACKS = [
  {
    slug: "marketer-5",
    label: "마케터 5회차",
    sub: "AI 기반 디지털 마케팅 부트캠프",
    accent: "#3B82F6",
    emoji: "📊",
    active: true,
  },
  {
    slug: "marketer-6",
    label: "마케터 6회차",
    sub: "AI 기반 디지털 마케팅 부트캠프",
    accent: "#6366F1",
    emoji: "📊",
    active: false,
  },
  {
    slug: "designer-4",
    label: "디자이너 4회차",
    sub: "AI 기반 디지털 디자인 부트캠프",
    accent: "#F59E0B",
    emoji: "🎨",
    active: false,
  },
  {
    slug: "designer-5",
    label: "디자이너 5회차",
    sub: "AI 기반 디지털 디자인 부트캠프",
    accent: "#10B981",
    emoji: "🎨",
    active: false,
  },
  {
    slug: "designer-6",
    label: "디자이너 6회차",
    sub: "AI 기반 디지털 디자인 부트캠프",
    accent: "#8B5CF6",
    emoji: "🎨",
    active: false,
  },
];

export default function Page() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "80px 24px" }}>
      <div style={{ marginBottom: 56 }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, margin: 0 }}>Pocketwatch 대시보드</h1>
        <p style={{ color: "#666", marginTop: 10, marginBottom: 0, fontSize: 15 }}>
          관리할 트랙과 회차를 선택하세요
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
        }}
      >
        {TRACKS.map((track) =>
          track.active ? (
            <Link
              key={track.slug}
              href={`/${track.slug}`}
              style={{
                display: "block",
                padding: "32px 28px",
                background: "#FFF",
                border: "1px solid #E8E8E8",
                borderTop: `4px solid ${track.accent}`,
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <TrackCardInner track={track} />
            </Link>
          ) : (
            <div
              key={track.slug}
              style={{
                display: "block",
                padding: "32px 28px",
                background: "#F9F9F9",
                border: "1px solid #E8E8E8",
                borderTop: `4px solid #D1D5DB`,
                borderRadius: 10,
                cursor: "not-allowed",
                opacity: 0.6,
              }}
            >
              <TrackCardInner track={track} comingSoon />
            </div>
          )
        )}
      </div>
    </main>
  );
}

function TrackCardInner({
  track,
  comingSoon,
}: {
  track: (typeof TRACKS)[number];
  comingSoon?: boolean;
}) {
  return (
    <>
      <div style={{ fontSize: 30, marginBottom: 12 }}>{track.emoji}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 19, fontWeight: 700 }}>{track.label}</span>
        {comingSoon && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#9CA3AF",
              background: "#F3F4F6",
              border: "1px solid #E5E7EB",
              borderRadius: 4,
              padding: "2px 7px",
            }}
          >
            준비 중
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>{track.sub}</div>
    </>
  );
}
