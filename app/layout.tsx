import type { Metadata } from "next";
import type { ReactNode } from "react";
import AccessLogger from "./AccessLogger";

export const metadata: Metadata = {
  title: "Pocketwatch Submission",
  description: "사내 AI 해커톤 결과물",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, 'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
          background: "#FAFAFA",
          color: "#1A1A1A",
        }}
      >
        <AccessLogger />
        {children}
      </body>
    </html>
  );
}
