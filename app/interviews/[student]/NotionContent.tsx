"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function preprocessNotionContent(raw: string): string {
  let s = raw;

  // Notion 전용 빈 블록 제거
  s = s.replace(/<empty-block\s*\/?>/gi, "");

  // Notion discussion span 태그 제거 (내용 없음)
  s = s.replace(/<span\s+discussion-urls="[^"]*"\s*\/>/gi, "");
  s = s.replace(/<span\s+discussion-urls="[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "$1");

  // color span 태그 제거 (내용 유지)
  s = s.replace(/<span\s+color="[^"]*">([\s\S]*?)<\/span>/gi, "$1");

  // <br> → 줄바꿈
  s = s.replace(/<br\s*\/?>/gi, "\n");

  // 테이블 구조 → 불릿 리스트로 변환
  s = s.replace(/<colgroup[\s\S]*?<\/colgroup>/gi, "");
  s = s.replace(/<col[^>]*\/?>/gi, "");
  s = s.replace(/<\/?(table|thead|tbody|tfoot)[^>]*>/gi, "\n");
  s = s.replace(/<tr[^>]*>/gi, "");
  s = s.replace(/<\/tr>/gi, "\n");
  s = s.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, (_, cell) => {
    const text = cell.replace(/<[^>]+>/g, "").trim();
    return text ? `- ${text}\n` : "";
  });

  // 나머지 HTML 태그 전부 제거
  s = s.replace(/<[^>]+>/g, "");

  // HTML 엔티티 디코딩
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

  // Notion 이스케이프 괄호 원복: \[ → [
  s = s.replace(/\\\[/g, "[").replace(/\\\]/g, "]");

  // ### [섹션명] 형태 → ### 섹션명
  s = s.replace(/^(#{1,3})\s*\[(.+?)\]\s*$/gm, "$1 $2");

  // 독립 라인 [섹션명] 형태 → ### 섹션명
  s = s.replace(/^\[(.+?)\]\s*$/gm, "### $1");

  // 탭 들여쓰기 불릿 → 마크다운 들여쓰기
  s = s.replace(/^\t\t- /gm, "    - ");
  s = s.replace(/^\t- /gm, "  - ");
  s = s.replace(/^\t(\d+)\. /gm, "   $1. ");

  // 연속 빈 줄 정리
  s = s.replace(/\n{3,}/g, "\n\n").trim();

  return s;
}

interface NotionContentProps {
  content: string;
  compact?: boolean;
  maxChars?: number;
}

export function NotionContent({ content, compact = false, maxChars }: NotionContentProps) {
  let processed = preprocessNotionContent(content);
  if (maxChars && processed.length > maxChars) {
    processed = processed.slice(0, maxChars) + "…";
  }

  const fs = compact ? 11 : 13;
  const headerFs = compact ? 10 : 11;
  const headerMt = compact ? 8 : 14;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <div style={{
            fontWeight: 700, color: "#555", fontSize: headerFs,
            letterSpacing: "0.06em", marginTop: headerMt, marginBottom: 3,
            paddingBottom: 3, borderBottom: "1px solid #F0F0F0",
          }}>
            {children}
          </div>
        ),
        h2: ({ children }) => (
          <div style={{
            fontWeight: 700, color: "#555", fontSize: headerFs,
            letterSpacing: "0.06em", marginTop: headerMt, marginBottom: 3,
            paddingBottom: 3, borderBottom: "1px solid #F0F0F0",
          }}>
            {children}
          </div>
        ),
        h3: ({ children }) => (
          <div style={{
            fontWeight: 700, color: "#555", fontSize: headerFs,
            letterSpacing: "0.06em", marginTop: headerMt, marginBottom: 3,
            paddingBottom: 3, borderBottom: "1px solid #F0F0F0",
          }}>
            {children}
          </div>
        ),
        p: ({ children }) => (
          <p style={{ margin: compact ? "1px 0" : "3px 0", lineHeight: 1.7, fontSize: fs }}>
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul style={{ listStyle: "none", padding: 0, margin: compact ? "2px 0" : "4px 0" }}>
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol style={{ paddingLeft: 16, margin: compact ? "2px 0" : "4px 0" }}>
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li style={{
            display: "flex", gap: 6, marginBottom: 2,
            fontSize: fs, lineHeight: 1.6, listStyle: "none",
          }}>
            <span style={{ color: "#AAAAAA", flexShrink: 0, marginTop: 1 }}>•</span>
            <span style={{ flex: 1 }}>{children}</span>
          </li>
        ),
        strong: ({ children }) => (
          <strong style={{ fontWeight: 700, color: "#333" }}>{children}</strong>
        ),
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}
