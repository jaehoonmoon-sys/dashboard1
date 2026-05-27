/**
 * Pocketwatch gateway client helper.
 *
 * 사용:
 *   import { gateway } from "@/lib/gateway";
 *   const students = await gateway("/eduops/students");
 *
 * Vibe Coding:
 *   "@eduops-students 스킬로 만족도 평균 조회" 라고 말하면
 *   Claude Code가 자동으로 이 helper를 사용한다.
 */

const URL = process.env.HACKATHON_GATEWAY_URL || "";
const TOKEN = process.env.HACKATHON_GATEWAY_TOKEN || "";

export async function gateway<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!URL || !TOKEN) {
    throw new Error("HACKATHON_GATEWAY_URL · HACKATHON_GATEWAY_TOKEN 누락 (.env)");
  }
  const resp = await fetch(`${URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    // Server Components에서 default cache 회피
    cache: "no-store",
  });
  if (!resp.ok) {
    throw new Error(`Gateway ${resp.status}: ${await resp.text()}`);
  }
  return (await resp.json()) as T;
}
