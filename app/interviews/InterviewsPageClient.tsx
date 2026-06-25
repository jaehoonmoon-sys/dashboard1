"use client";

import { useState } from "react";
import DashboardTable, { StudentSummary, InterviewStat } from "./DashboardTable";
import TeamGroupView from "./TeamGroupView";
import { CHAPTERS } from "../../lib/curriculum";
import { LectureProgress, ChapterScore, ChapterRoleMap } from "./page";

export default function InterviewsPageClient({
  students,
  stats,
  todayConditions,
  teamMapByOrder,
  lectureProgress,
  chapterScoreMap,
  chapterRoleMap,
}: {
  students: StudentSummary[];
  stats: InterviewStat[];
  todayConditions: Record<string, number>;
  teamMapByOrder: Record<number, Record<string, string[]>>;
  lectureProgress: LectureProgress[];
  chapterScoreMap: Record<number, Record<string, ChapterScore>>;
  chapterRoleMap: ChapterRoleMap;
}) {
  const [activeTab, setActiveTab] = useState<"전체" | number>("전체");
  const condMap = new Map(Object.entries(todayConditions));

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 16,
          borderBottom: "2px solid #E8E8E8",
          overflowX: "auto",
        }}
      >
        <button
          onClick={() => setActiveTab("전체")}
          style={{
            padding: "10px 18px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "전체" ? "2px solid #1A1A1A" : "2px solid transparent",
            marginBottom: -2,
            color: activeTab === "전체" ? "#1A1A1A" : "#888",
            fontWeight: activeTab === "전체" ? 700 : 400,
            fontSize: 13,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "color 0.15s",
          }}
        >
          전체
        </button>
        {CHAPTERS.map((ch) => {
          const isActive = activeTab === ch.order;
          const hasData = Object.keys(teamMapByOrder[ch.order] ?? {}).length > 0;
          return (
            <button
              key={ch.order}
              onClick={() => setActiveTab(ch.order)}
              style={{
                padding: "10px 18px",
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid #1A1A1A" : "2px solid transparent",
                marginBottom: -2,
                color: isActive ? "#1A1A1A" : hasData ? "#888" : "#CCCCCC",
                fontWeight: isActive ? 700 : 400,
                fontSize: 13,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "color 0.15s",
              }}
            >
              {ch.fullName}
            </button>
          );
        })}
      </div>

      {activeTab === "전체" ? (
        <DashboardTable
          students={students}
          stats={stats}
          hrefPrefix="/interviews"
          todayConditions={condMap}
        />
      ) : (
        <TeamGroupView
          chapter={CHAPTERS[activeTab as number]?.fullName ?? ""}
          chapterCode={CHAPTERS[activeTab as number]?.name ?? ""}
          teamMap={teamMapByOrder[activeTab as number] ?? {}}
          students={students}
          stats={stats}
          todayConditions={condMap}
          hrefPrefix="/interviews"
          lectureProgress={lectureProgress}
          chapterScores={chapterScoreMap[activeTab as number] ?? {}}
          chapterRoles={chapterRoleMap[activeTab as number] ?? {}}
        />
      )}
    </div>
  );
}
