import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

const SCRIPT = path.join(process.cwd(), "..", "팀편성", "team_assignment_supabase.py");

export async function POST(req: NextRequest) {
  const { chapter_code, cohort } = (await req.json()) as {
    chapter_code: string;
    cohort: string;
  };

  if (!chapter_code || !cohort) {
    return NextResponse.json({ ok: false, error: "chapter_code, cohort 필요" }, { status: 400 });
  }

  return new Promise<NextResponse>((resolve) => {
    const proc = spawn("python", [SCRIPT, chapter_code, cohort], {
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf-8"); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf-8"); });

    proc.on("error", (err: Error) => {
      resolve(
        NextResponse.json(
          { ok: false, error: `Python 실행 실패: ${err.message}` },
          { status: 500 }
        )
      );
    });

    proc.on("close", (code: number | null) => {
      if (code !== 0) {
        resolve(
          NextResponse.json(
            { ok: false, error: stderr || `프로세스 종료 코드 ${code}` },
            { status: 500 }
          )
        );
        return;
      }

      // 마지막 줄이 JSON 요약
      const lines = stdout.trim().split("\n");
      const lastLine = lines[lines.length - 1];
      try {
        const summary = JSON.parse(lastLine) as Record<string, unknown>;
        resolve(
          NextResponse.json({
            ok: true,
            output: stderr + (summary.hard_errors && (summary.hard_errors as unknown[]).length > 0
              ? `\nHard 오류: ${JSON.stringify(summary.hard_errors)}`
              : `\nHard 오류: 0건 / Soft 경고: ${summary.soft_warnings}건`),
            ...summary,
          })
        );
      } catch {
        resolve(NextResponse.json({ ok: true, output: stderr + "\n" + stdout }));
      }
    });
  });
}
