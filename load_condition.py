"""
Redash 7212 컨디션 로그 → Supabase mj_condition_logs 적재
Usage: python load_condition.py
"""
import json, urllib.request, urllib.error, os, sys

REDASH_BASE_URL = os.getenv("REDASH_BASE_URL", "https://redash-v2.spartacodingclub.kr")
REDASH_API_KEY  = os.getenv("REDASH_API_KEY_2",  "bTvtqWydrk0qdN8A587Uc8vSWUkMIHNYOEvz9unS")
REDASH_QUERY_ID = int(os.getenv("REDASH_QUERY_ID_2", "7212"))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "https://wrcpurlzuqhssewojghw.supabase.co")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_zDKVffzmZSlZNdgpFPPV8g_AIEA-Lvy")

TARGET_COHORT_KEYWORD = "5회차"

# 7212 컬럼 순서:
# 0: 수강생_이름  1: updatedat  2: contact  3: marketingroundtitle
# 4: roundid    5: __v         6: onlineuserid  7: content
# 8: contactrequest  9: _id   10: createdat   11: score
# 12: __hevo__marked_deleted  13: tags
COL = dict(
    student_name=0, updatedat=1, contact=2, cohort_title=3,
    roundid=4, onlineuserid=6, content=7, contact_request=8,
    mongo_id=9, created_at=10, score=11, deleted=12, tags=13,
)

def fetch_redash():
    url = f"{REDASH_BASE_URL}/api/queries/{REDASH_QUERY_ID}/results.json?api_key={REDASH_API_KEY}"
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)

def upsert(records):
    url = f"{SUPABASE_URL}/rest/v1/mj_condition_logs"
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
        body = e.read().decode("utf-8", errors="replace")[:400]
        print(f"  HTTP {e.code}: {body}", file=sys.stderr)
        return e.code

def main():
    print(f"Fetching Redash {REDASH_QUERY_ID}...")
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

        cohort_title = vals[COL["cohort_title"]] or ""
        if TARGET_COHORT_KEYWORD not in cohort_title:
            skipped += 1
            continue

        deleted = vals[COL["deleted"]]
        if deleted:
            skipped += 1
            continue

        student_name = vals[COL["student_name"]]
        if not student_name:
            skipped += 1
            continue

        mongo_id = vals[COL["mongo_id"]]
        score_raw = vals[COL["score"]]
        try:
            score = int(score_raw)
        except (TypeError, ValueError):
            score = None

        tags_raw = vals[COL["tags"]]
        tags = None
        if tags_raw:
            try:
                tags = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
            except Exception:
                tags = None

        records.append({
            "student_name":    student_name,
            "online_user_id":  vals[COL["onlineuserid"]],
            "mongo_id":        mongo_id,
            "score":           score,
            "content":         vals[COL["content"]],
            "contact_request": bool(vals[COL["contact_request"]]),
            "logged_at":       vals[COL["created_at"]],
            "tags":            tags,
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
