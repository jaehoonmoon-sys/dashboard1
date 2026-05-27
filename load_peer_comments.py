"""
Redash 7208 동료평가 → Supabase mj_peer_comments 적재
Usage: python load_peer_comments.py
"""
import json, urllib.request, urllib.parse, urllib.error, os, sys

REDASH_BASE_URL = os.getenv("REDASH_BASE_URL", "https://redash-v2.spartacodingclub.kr")
REDASH_API_KEY  = os.getenv("REDASH_API_KEY_3",  "GLvwJ4EMqEti7vWAMavr83bXN8T99mZEFE0dJBnX")
REDASH_QUERY_ID = int(os.getenv("REDASH_QUERY_ID_3", "7208"))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "https://wrcpurlzuqhssewojghw.supabase.co")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_zDKVffzmZSlZNdgpFPPV8g_AIEA-Lvy")

TARGET_COHORT_KEYWORD = "5회차"

# 컬럼 인덱스 매핑 (7208: 기수, 평가_대상, 평가자_이름, 챕터명, 팀번호,
#   소통점수, 실력점수, 소통실력코멘트, 몰입점수, 성장점수, 몰입성장코멘트, 제출시)
COL = dict(cohort=0, evaluated=1, evaluator=2, chapter=3, team_no=4,
           comm=5, skill=6, comm_skill_cmt=7, immerse=8, growth=9,
           immerse_growth_cmt=10, submitted=11)

def fetch_redash():
    url = f"{REDASH_BASE_URL}/api/queries/{REDASH_QUERY_ID}/results.json?api_key={REDASH_API_KEY}"
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)

def _float(v):
    try: return float(v)
    except: return None

def _int(v):
    try: return int(v)
    except: return None

def upsert(records):
    url = f"{SUPABASE_URL}/rest/v1/mj_peer_comments"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json; charset=utf-8",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    payload = json.dumps(records, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:300]
        print(f"  HTTP {e.code}: {body}", file=sys.stderr)
        return e.code

def main():
    print("Fetching Redash 7208...")
    data = fetch_redash()
    rows = data["query_result"]["data"]["rows"]
    print(f"  Total rows: {len(rows)}")

    records = []
    skipped = 0
    for row in rows:
        vals = list(row.values())
        if len(vals) < 12:
            skipped += 1
            continue
        cohort = vals[COL["cohort"]] or ""
        if TARGET_COHORT_KEYWORD not in cohort:
            skipped += 1
            continue
        evaluated = vals[COL["evaluated"]]
        evaluator = vals[COL["evaluator"]]
        if not evaluated or not evaluator:
            skipped += 1
            continue
        records.append({
            "cohort":                 cohort,
            "evaluated_name":         evaluated,
            "evaluator_name":         evaluator,
            "chapter":                vals[COL["chapter"]],
            "team_no":                _int(vals[COL["team_no"]]),
            "comm_score":             _float(vals[COL["comm"]]),
            "skill_score":            _float(vals[COL["skill"]]),
            "comm_skill_comment":     vals[COL["comm_skill_cmt"]],
            "immerse_score":          _float(vals[COL["immerse"]]),
            "growth_score":           _float(vals[COL["growth"]]),
            "immerse_growth_comment": vals[COL["immerse_growth_cmt"]],
            "submitted_at":           vals[COL["submitted"]],
        })

    print(f"  Records to upsert: {len(records)}  (skipped: {skipped})")

    batch_size = 200
    ok = 0
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        status = upsert(batch)
        if status in (200, 201):
            ok += len(batch)
            print(f"  [{i+len(batch)}/{len(records)}] OK")
        else:
            print(f"  [{i+len(batch)}/{len(records)}] FAIL status={status}")

    print(f"Done: {ok}/{len(records)} upserted")

if __name__ == "__main__":
    main()
