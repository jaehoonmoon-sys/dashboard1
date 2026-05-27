"""
Redash 7225 출결 로그 → Supabase mj_attendance_log 적재
Usage: python load_attendance_log.py
"""
import os, sys, json, urllib.request, urllib.error
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path

def _load_env():
    env_file = Path(__file__).parent / ".env.local"
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

_load_env()

REDASH_BASE  = os.environ.get("REDASH_BASE_URL", "https://redash-v2.spartacodingclub.kr").rstrip("/")
REDASH_KEY   = os.environ.get("REDASH_API_KEY_4") or os.environ.get("redash-api-key-4", "")
QUERY_ID     = os.environ.get("REDASH_QUERY_ID_4") or os.environ.get("redash_query_id_4", "7225")
SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

def fetch_redash() -> list[dict]:
    url = f"{REDASH_BASE}/api/queries/{QUERY_ID}/results.json?api_key={REDASH_KEY}"
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.load(r)
    return data["query_result"]["data"]["rows"]

def upsert(records: list[dict]) -> int:
    url = f"{SUPABASE_URL}/rest/v1/mj_attendance_log"
    payload = json.dumps(records, ensure_ascii=False).encode("utf-8")
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates,return=minimal",
    }
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:400]
        print(f"  HTTP {e.code}: {body}", file=sys.stderr)
        return e.code

def main():
    print(f"Redash {QUERY_ID} 조회 중...")
    rows = fetch_redash()
    print(f"총 {len(rows)}행\n")

    records = []
    for row in rows:
        date_raw = row.get("출결일자", "") or ""
        date_str = date_raw[:10] if date_raw else None
        if not date_str:
            continue

        records.append({
            "cohort":        row.get("기수명"),
            "student_name":  row.get("이름"),
            "user_id":       row.get("유저id"),
            "date":          date_str,
            "status":        row.get("출결상태"),
            "checkin_time":  row.get("입실시간"),
            "checkout_time": row.get("퇴실시간"),
        })

    print(f"적재 대상: {len(records)}건\n")

    batch_size = 200
    ok = 0
    for i in range(0, len(records), batch_size):
        batch = records[i: i + batch_size]
        status = upsert(batch)
        if status in (200, 201):
            ok += len(batch)
            print(f"  [{i + len(batch)}/{len(records)}] OK")
        else:
            print(f"  [{i + len(batch)}/{len(records)}] FAIL status={status}")

    print(f"\n완료: {ok}/{len(records)}건 적재")

if __name__ == "__main__":
    main()
