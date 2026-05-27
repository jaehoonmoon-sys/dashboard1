# 🎯 트랙 저성과자 면담 관리 시스템 — 문재훈 (Team 1)

다면평가·NPS·운영만족도 데이터를 종합해 **저성과자를 자동 분류**하고 알맞은 운영진(운영기획매니저·학습관리매니저·튜터)에게 면담 업무를 자동 할당하는 대시보드.

## 배포 URL
https://team-1-production-9361.up.railway.app/jaehoon

> Team 1 공용 호스팅 (`app/jaehoon/page.tsx` 라우트). `git push` 시 자동 배포.
> 로컬 dev: `cd submissions/문재훈 && npm run dev` → http://localhost:3000

## 시간 단축

기존: 매 챕터마다 운영기획매니저가 수기로 다면평가·NPS·운영만족도 시트를 열어 **저성과자를 분리하고 담당자를 매칭** → 1챕터당 약 **45분** 소요.
이후: Supabase view + 자동 분류 규칙으로 **5분 → 즉시 대시보드 조회**로 단축 = **40분 단축 / 챕터**.

추가로 면담 누락·책임소재 불명확 문제도 동시에 해결됨.

## 핵심 기능 (구현 완료)

| # | 기능 | 설명 |
|---|---|---|
| 1 | **데이터 적재** | Supabase `survey_results` 테이블 — 다면평가(자기+동료)·NPS·운영만족도 시계열 |
| 2 | **저성과자 자동 분류** | SQL view `mj_risk_candidates` — 4가지 신호로 위험 유형 산출 |
| 3 | **운영진 자동 매칭** | 유형별 담당자 자동 배정 (`mj_risk_assignments` 테이블) |
| 4 | **대시보드 UI** | 운영진별 그룹 + 위험도 정렬 + 사유 + 상태 |

## 저성과자 분류 규칙

| 신호 | 임계값 | 담당 |
|---|---|---|
| NPS 낮음 | ≤6점 | 운영기획매니저 |
| 운영만족도 낮음 | ≤3.0/5 | 학습관리매니저 |
| 동료평가 낮음 | 평균 ≤3.0/5 | 튜터 |
| 메타인지 갭 | |자기-동료| ≥1.5 | 운영기획매니저 |
| **복합 (2개 이상)** | — | **운영기획매니저 우선** |

## 데이터 스키마

```
public.survey_results        ← 입력 (다면평가 + NPS + 운영만족도)
public.mj_risk_candidates    ← view: 자동 분류 로직 (SQL CASE)
public.mj_risk_assignments   ← 결과: 학생별 위험유형 + 담당자 + 상태
```

## 기술 스택

- **Next.js 15** (App Router, RSC) — Railway 자동 배포
- **Supabase** — Postgres + RLS, view 기반 분류 로직 (DDL은 마이그레이션 적용)
- **TypeScript** — 타입 안전성

## 사용한 인프라

- `shared/boilerplate/A-dashboard/` (Next.js scaffold)
- Supabase MCP (스키마 설계·migration·시드)
- (선택) `shared/skills/notion-query`·`eduops-students` — gateway 경유 실데이터 연동 가능

## 향후 확장 (오늘 제외)

- 면담록 시계열 트래킹 (챕터별 변화)
- 슬랙 자동 알림 (배정 즉시 담당자 멘션)
- 노션/Redash 실데이터 자동 동기화 (현재는 시드)
