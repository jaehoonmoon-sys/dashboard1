export type ChapterDef = {
  order: number;
  name: string;
  fullName: string;
  period: string;
  start: string;
  end: string;
};

export const CHAPTERS: ChapterDef[] = [
  { order: 0, name: "CH.0", fullName: "CH.0 온보딩",         period: "4/20 ~ 4/24", start: "2026-04-20", end: "2026-04-24" },
  { order: 1, name: "CH.1", fullName: "CH.1 마케팅 입문",     period: "4/27 ~ 5/12", start: "2026-04-27", end: "2026-05-12" },
  { order: 2, name: "CH.2", fullName: "CH.2 기초 프로젝트",   period: "5/13 ~ 5/19", start: "2026-05-13", end: "2026-05-19" },
  { order: 3, name: "CH.3", fullName: "CH.3 마케팅 숙련",     period: "5/20 ~ 6/11", start: "2026-05-20", end: "2026-06-11" },
  { order: 4, name: "CH.4", fullName: "CH.4 심화 프로젝트",   period: "6/12 ~ 6/25", start: "2026-06-12", end: "2026-06-25" },
  { order: 5, name: "CH.5", fullName: "CH.5 마케팅 심화",     period: "6/26 ~ 7/9",  start: "2026-06-26", end: "2026-07-09" },
  { order: 6, name: "CH.6", fullName: "CH.6 실전 프로젝트",   period: "7/10 ~ 7/16", start: "2026-07-10", end: "2026-07-16" },
  { order: 7, name: "CH.7", fullName: "CH.7 고객 데이터",     period: "7/20 ~ 7/28", start: "2026-07-20", end: "2026-07-28" },
  { order: 8, name: "CH.8", fullName: "CH.8 그로스 마케팅",   period: "7/29 ~ 8/11", start: "2026-07-29", end: "2026-08-11" },
  { order: 9, name: "CH.9", fullName: "CH.9 최종 프로젝트",   period: "8/12 ~ 9/8",  start: "2026-08-12", end: "2026-09-08" },
];

export const CHAPTER_END: Record<number, string> = Object.fromEntries(
  CHAPTERS.map((ch) => [ch.order, ch.end])
);

export function dateToChapterOrder(date: string): number {
  const d = date.slice(0, 10);
  for (let i = CHAPTERS.length - 1; i >= 0; i--) {
    if (d >= CHAPTERS[i].start) return CHAPTERS[i].order;
  }
  return 0;
}
