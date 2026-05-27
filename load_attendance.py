"""
구글 시트 출결 데이터 → Supabase mj_attendance 적재
Usage: python load_attendance.py
"""
import os, sys, json, time, base64, re, urllib.request, urllib.parse
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from datetime import date, datetime

# ── 환경변수 로드 ──────────────────────────────────────────────────────────────

def _load_env():
    env_file = Path(__file__).parent / ".env.local"
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

_load_env()

SHEET_ID     = os.environ["ATTENDANCE_SHEET_ID"]
GID          = os.environ["ATTENDANCE_GID"]
SA_EMAIL     = os.environ["GOOGLE_CLIENT_EMAIL"]
SA_PKEY      = os.environ["GOOGLE_PRIVATE_KEY"].replace("\\n", "\n")
SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

# ── Google 인증 ────────────────────────────────────────────────────────────────

def _get_access_token() -> str:
    from cryptography.hazmat.primitives import serialization, hashes
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.backends import default_backend

    pk = serialization.load_pem_private_key(SA_PKEY.encode(), password=None, backend=default_backend())
    now = int(time.time())
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).rstrip(b"=")
    claim  = base64.urlsafe_b64encode(json.dumps({
        "iss":   SA_EMAIL,
        "scope": "https://www.googleapis.com/auth/spreadsheets.readonly",
        "aud":   "https://oauth2.googleapis.com/token",
        "exp":   now + 3600,
        "iat":   now,
    }).encode()).rstrip(b"=")
    msg = header + b"." + claim
    sig = base64.urlsafe_b64encode(pk.sign(msg, padding.PKCS1v15(), hashes.SHA256())).rstrip(b"=")
    jwt = (msg + b"." + sig).decode()

    data = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion":  jwt,
    }).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)["access_token"]

# ── 시트 읽기 ──────────────────────────────────────────────────────────────────

def _fetch_sheet(token: str) -> list[list[str]]:
    # 탭 이름 조회
    meta_url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}?fields=sheets.properties"
    req = urllib.request.Request(meta_url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=10) as r:
        meta = json.load(r)

    sheet_name = next(
        s["properties"]["title"]
        for s in meta["sheets"]
        if s["properties"]["sheetId"] == int(GID)
    )

    # 전체 데이터 읽기
    range_str = urllib.parse.quote(f"{sheet_name}!A1:ZZ")
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{range_str}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r).get("values", [])

# ── 날짜 파싱 ("4. 20 월" → date) ─────────────────────────────────────────────

def _parse_date(header: str) -> date | None:
    m = re.search(r"(\d+)\.\s*(\d+)", header)
    if not m:
        return None
    month, day = int(m.group(1)), int(m.group(2))
    year = date.today().year
    try:
        return date(year, month, day)
    except ValueError:
        return None

# ── 출결 셀 파싱 ("결석-여행일정" → type, reason) ─────────────────────────────

KNOWN_TYPES = {"지각", "결석", "조퇴", "공가", "외출"}

def _parse_cell(cell: str) -> tuple[str, str | None]:
    cell = cell.strip()
    # 구분자: " - " 또는 "-" 또는 " "
    for sep in [" - ", "-", " "]:
        if sep in cell:
            left, _, right = cell.partition(sep)
            left = left.strip()
            right = right.strip()
            if left in KNOWN_TYPES:
                return left, right or None
    return cell, None

# ── Supabase upsert ────────────────────────────────────────────────────────────

def _upsert(records: list[dict]) -> int:
    url = f"{SUPABASE_URL}/rest/v1/mj_attendance?on_conflict=student_no,date"
    payload = json.dumps(records, ensure_ascii=False, default=str).encode("utf-8")
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates,return=minimal",
    }
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:400]
        print(f"  HTTP {e.code}: {body}", file=sys.stderr)
        return e.code

# ── 메인 ──────────────────────────────────────────────────────────────────────

def main():
    print("구글 인증 중...")
    token = _get_access_token()
    print("인증 완료\n")

    print("시트 읽는 중...")
    rows = _fetch_sheet(token)
    print(f"총 {len(rows)}행 읽음\n")

    # 헤더 행 (2행, index 1) 에서 날짜 컬럼 파싱
    header_row = rows[1] if len(rows) > 1 else []
    date_cols: dict[int, date] = {}
    for col_idx, cell in enumerate(header_row):
        if col_idx < 6:
            continue
        d = _parse_date(cell)
        if d:
            date_cols[col_idx] = d

    print(f"날짜 컬럼 {len(date_cols)}개 인식: {min(date_cols.values())} ~ {max(date_cols.values())}\n")

    records = []
    skipped = 0

    for row in rows[2:]:  # 3행부터 수강생 데이터
        if not row or not row[0]:
            skipped += 1
            continue

        try:
            student_no = int(row[0])
        except ValueError:
            skipped += 1
            continue

        student_name         = row[1].strip() if len(row) > 1 else ""
        team_no              = int(row[2]) if len(row) > 2 and row[2].strip().isdigit() else None
        note                 = row[3].strip() if len(row) > 3 else None
        absence_rate_period  = row[4].strip() if len(row) > 4 else None
        absence_rate_total   = row[5].strip() if len(row) > 5 else None

        if not student_name:
            skipped += 1
            continue

        today = date.today()
        for col_idx, event_date in date_cols.items():
            cell_val = row[col_idx].strip() if col_idx < len(row) else ""
            if not cell_val:
                if event_date > today:
                    continue  # 미래 날짜 빈 셀은 저장 안 함
                event_type, reason = "출석", None
            else:
                event_type, reason = _parse_cell(cell_val)

            records.append({
                "student_no":           student_no,
                "student_name":         student_name,
                "team_no":              team_no,
                "note":                 note or None,
                "absence_rate_period":  absence_rate_period or None,
                "absence_rate_total":   absence_rate_total or None,
                "date":                 event_date.isoformat(),
                "type":                 event_type,
                "reason":               reason,
            })

    print(f"이벤트 {len(records)}건 (스킵 {skipped}행)\n")

    if not records:
        print("적재할 데이터 없음")
        return

    batch_size = 200
    ok = 0
    for i in range(0, len(records), batch_size):
        batch = records[i: i + batch_size]
        status = _upsert(batch)
        if status in (200, 201):
            ok += len(batch)
            print(f"  [{i + len(batch)}/{len(records)}] OK")
        else:
            print(f"  [{i + len(batch)}/{len(records)}] FAIL status={status}")

    print(f"\n완료: {ok}/{len(records)}건 적재")


if __name__ == "__main__":
    main()
