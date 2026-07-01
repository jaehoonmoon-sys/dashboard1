"""
ds5_discover.py — 디자이너 5회차 Redash 탐색 스크립트
cohort명, roundclassid, 챕터명, business_id 등을 찾아서 출력합니다.
"""
import os, sys, json, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path

def _load_env():
    env_file = Path(__file__).parent / ".env.local"
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

_load_env()

REDASH_BASE = os.environ.get("REDASH_BASE_URL", "https://redash-v2.spartacodingclub.kr").rstrip("/")
REDASH_KEY  = os.environ.get("redash_user_api_key", "")
DS_AW = 1    # AWarehouse (Redshift)
DS_LMS = 21  # dbonline_v3 (신 LMS)


def run_redash(sql: str, ds_id: int = DS_AW, wait: int = 10) -> list[dict]:
    payload = json.dumps({"data_source_id": ds_id, "query": sql, "max_age": 0}).encode()
    req = urllib.request.Request(
        f"{REDASH_BASE}/api/query_results",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Key {REDASH_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        job_id = json.load(r)["job"]["id"]

    print(f"  job {job_id} ({wait}s 대기)...", end=" ", flush=True)
    time.sleep(wait)

    for _ in range(18):
        req2 = urllib.request.Request(
            f"{REDASH_BASE}/api/jobs/{job_id}",
            headers={"Authorization": f"Key {REDASH_KEY}"},
        )
        with urllib.request.urlopen(req2, timeout=15) as r:
            job = json.load(r)["job"]
        if job.get("query_result_id"):
            req3 = urllib.request.Request(
                f"{REDASH_BASE}/api/query_results/{job['query_result_id']}",
                headers={"Authorization": f"Key {REDASH_KEY}"},
            )
            with urllib.request.urlopen(req3, timeout=15) as r:
                rows = json.load(r)["query_result"]["data"]["rows"]
            print(f"완료 ({len(rows)}행)")
            return rows
        if job.get("error"):
            raise RuntimeError(f"Redash 오류: {job['error']}")
        print(".", end="", flush=True)
        time.sleep(10)
    raise TimeoutError("타임아웃")


def pp(rows: list[dict], max_rows: int = 30):
    if not rows:
        print("  (결과 없음)")
        return
    for r in rows[:max_rows]:
        print(" ", r)
    if len(rows) > max_rows:
        print(f"  ... 총 {len(rows)}행")


# ── Q1. 디자이너 관련 cohort명 탐색 ─────────────────────────────────────
print("\n=== Q1. 디자이너 cohort명 (dbnbcamp_enrolleds) ===")
pp(run_redash("""
SELECT DISTINCT marketingroundtitle, COUNT(*) AS cnt
FROM dbnbcamp_enrolleds
WHERE (marketingroundtitle ILIKE '%디자인%'
       OR marketingroundtitle ILIKE '%디자이너%')
  AND __hevo__marked_deleted = false
GROUP BY marketingroundtitle
ORDER BY cnt DESC
"""))

# ── Q2. 디자이너 관련 rounds (dbnbcamp_rounds) ───────────────────────────
print("\n=== Q2. 디자이너 rounds (_id = roundclassid 후보) ===")
pp(run_redash("""
SELECT _id, title, startdate, enddate
FROM dbnbcamp_rounds
WHERE (title ILIKE '%디자인%' OR title ILIKE '%디자이너%')
  AND __hevo__marked_deleted = false
ORDER BY startdate DESC
LIMIT 20
"""))

# ── Q3. 디자이너 챕터명 탐색 ────────────────────────────────────────────
print("\n=== Q3. 디자이너 챕터명 (dbnbcamp_rounds_chapters) ===")
pp(run_redash("""
SELECT DISTINCT rc.title AS round_title, ch.title AS chapter_title, ch.startdate
FROM dbnbcamp_rounds_chapters ch
JOIN dbnbcamp_rounds rc ON rc._id = ch.roundid
WHERE (rc.title ILIKE '%디자인%' OR rc.title ILIKE '%디자이너%')
  AND rc.__hevo__marked_deleted = false
  AND ch.__hevo__marked_deleted = false
ORDER BY ch.startdate DESC
LIMIT 30
"""))

# ── Q4. 디자이너 5회차 다면평가 데이터 샘플 ─────────────────────────────
print("\n=== Q4. 디자이너 5회차 다면평가 샘플 (evaluations_users) ===")
pp(run_redash("""
SELECT DISTINCT
    nbcen.marketingroundtitle AS cohort,
    COUNT(DISTINCT nbcmy.userid) AS student_cnt,
    MIN(nbcmy.createdat) AS first_eval,
    MAX(nbcmy.createdat) AS last_eval
FROM dbnbcamp_evaluations_users nbcmy
LEFT JOIN dbnbcamp_enrolleds nbcen ON nbcen.userid = nbcmy.userid
WHERE (nbcen.marketingroundtitle ILIKE '%디자인%'
       OR nbcen.marketingroundtitle ILIKE '%디자이너%')
  AND nbcen.__hevo__marked_deleted = false
  AND nbcmy.__hevo__marked_deleted = false
GROUP BY nbcen.marketingroundtitle
ORDER BY first_eval DESC
"""), max_rows=20)

# ── Q5. 디자이너 5회차 팀 확인 (rounds로 roundclassid 확인) ─────────────
print("\n=== Q5. 디자이너 관련 teams.roundclassid 샘플 ===")
pp(run_redash("""
SELECT DISTINCT t.roundclassid, rc.title AS round_title, COUNT(t._id) AS team_cnt
FROM dbnbcamp_teams t
JOIN dbnbcamp_rounds rc ON rc._id = t.roundclassid
WHERE (rc.title ILIKE '%디자인%' OR rc.title ILIKE '%디자이너%')
  AND t.__hevo__marked_deleted = false
GROUP BY t.roundclassid, rc.title
ORDER BY team_cnt DESC
LIMIT 20
"""))

# ── Q6. dbonline_v3: 디자이너 관련 business 탐색 ────────────────────────
print("\n=== Q6. dbonline_v3 디자이너 business_id 탐색 ===")
try:
    pp(run_redash("""
SELECT id, name
FROM business
WHERE (name ILIKE '%디자인%' OR name ILIKE '%디자이너%')
ORDER BY id
LIMIT 20
""", ds_id=DS_LMS, wait=12))
except Exception as e:
    print(f"  오류: {e}")

print("\n=== 탐색 완료 ===")
