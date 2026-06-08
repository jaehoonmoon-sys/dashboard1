"""
data_agent.py — 통합 데이터 동기화 에이전트

Redash 저장 쿼리(7200/7208/7212/7225) 의존 없이,
Redash ad-hoc API로 AWarehouse를 직접 조회해 Supabase에 적재합니다.

Supabase 관계형 구조:
  mj_students (마스터)
    ← mj_student_profiles.student_id  (1:1 개인 배경 정보)
    ← mj_lecture_progress.student_id  (N:M via mj_courses)
    ← mj_evaluations.student_id
    ← mj_peer_comments.evaluator_student_id / evaluated_student_id
    ← mj_condition_logs.student_id
    ← mj_attendance_log.student_id
    ← mj_attendance.student_id        (이름 기반 매칭)
    ← mj_interview_records.student_id (이름 기반 매칭)
    ← mj_risk_assignments.student_id

  mj_chapters (챕터 룩업, static)
    ← mj_courses.chapter_code
    ← mj_lecture_progress → mj_courses → mj_chapters

Usage:
  python data_agent.py              # 전체 동기화 (students → 나머지 순서)
  python data_agent.py --students   # 학생 마스터만
  python data_agent.py --profiles   # 개인 배경 정보만
  python data_agent.py --lecture    # 강의 진도율만
  python data_agent.py --eval       # 다면평가만
  python data_agent.py --peer       # 동료평가만
  python data_agent.py --condition  # 컨디션 로그만
  python data_agent.py --qr         # QR 출결 로그만
  python data_agent.py --fix-names  # 이름 기반 FK 채우기 (attendance, interview)
"""

import os, sys, json, time, urllib.request, urllib.parse, urllib.error
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path

# =============================================================================
# CONFIG — 다음 기수 적용 시 이 블록만 수정
# =============================================================================
# COHORT_FILTER: dbnbcamp_enrolleds.marketingroundtitle LIKE 패턴
#   예) 디마 6기: "%디지털 마케팅%6%"
COHORT_FILTER = "%디지털 마케팅%5%"

# START_DATE: 기수 오프라인 시작일. 이 날짜 이후 출결·동료평가만 수집.
START_DATE = "2026-04-20"
# =============================================================================

# ── 환경변수 로드 ─────────────────────────────────────────────────────────

def _load_env():
    env_file = Path(__file__).parent / ".env.local"
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

_load_env()

REDASH_BASE  = os.environ.get("REDASH_BASE_URL", "https://redash-v2.spartacodingclub.kr").rstrip("/")
REDASH_KEY   = os.environ.get("redash_user_api_key", "")
SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

DS_AWAREHOUSE  = 1   # Redshift (AWarehouse)
DS_DBONLINE_V3 = 21  # PostgreSQL (신 LMS 플랫폼 — 강의 진도율)

# 디마 5기 dbonline_v3 식별 상수 (다음 기수 적용 시 함께 수정)
DIMA_BUSINESS_ID      = 48
DIMA_START_COURSE     = "마케팅 실무의 이해"  # 기수 시작 강의명 (course_start_date 기준)
DIMA_COURSE_IDS       = [286, 287, 293, 296, 298, 309, 319, 327, 341, 344]

# ── 학생 ID 매핑 ────────────────────────────────────────────────────────────
# sync_students() 실행 후 채워짐. 다른 sync 함수들이 student_id FK 채울 때 사용.
_student_map: dict[str, int] = {}       # nbcamp_user_id  → mj_students.id
_online_map:  dict[str, int] = {}       # online_user_id  → mj_students.id


def _sid(nbcamp_user_id) -> int | None:
    """nbcamp_user_id → mj_students.id 변환. 매핑 없으면 None."""
    return _student_map.get(str(nbcamp_user_id)) if nbcamp_user_id else None


def _load_student_map() -> None:
    """Supabase mj_students에서 ID 매핑을 로드 (nbcamp_user_id / online_user_id 양쪽)."""
    global _student_map, _online_map
    url = f"{SUPABASE_URL}/rest/v1/mj_students?select=id,nbcamp_user_id,online_user_id&limit=2000"
    req = urllib.request.Request(
        url,
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        rows = json.load(r)
    _student_map = {s["nbcamp_user_id"]: s["id"] for s in rows if s.get("nbcamp_user_id")}
    _online_map  = {s["online_user_id"]:  s["id"] for s in rows if s.get("online_user_id")}
    print(f"  학생 ID 매핑 로드: {len(_student_map)}명 (online_id {len(_online_map)}개)")


def _ensure_student_map() -> None:
    """student_map이 비어있으면 자동으로 로드."""
    if not _student_map:
        print("  [자동] 학생 ID 매핑 로드 중...")
        _load_student_map()


# ── Redash ad-hoc 실행 ────────────────────────────────────────────────────

def run_redash(sql: str, ds_id: int = DS_AWAREHOUSE, initial_wait: int = 10) -> list[dict]:
    """SQL을 Redash ad-hoc으로 실행하고 rows 리스트를 반환."""
    payload = json.dumps({"data_source_id": ds_id, "query": sql, "max_age": 0}).encode("utf-8")
    req = urllib.request.Request(
        f"{REDASH_BASE}/api/query_results",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Key {REDASH_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        job_id = json.load(r)["job"]["id"]

    print(f"  job {job_id} ({initial_wait}s 대기)...", end=" ", flush=True)
    time.sleep(initial_wait)

    for _ in range(18):  # 최대 3분 폴링
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

    raise TimeoutError("Redash 쿼리 타임아웃 (3분 초과)")


# ── Supabase 헬퍼 ─────────────────────────────────────────────────────────

def _h(extra: dict | None = None) -> dict:
    h = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }
    if extra:
        h.update(extra)
    return h


def sb_upsert(table: str, records: list[dict], on_conflict: str, batch: int = 200) -> int:
    ok = 0
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={urllib.parse.quote(on_conflict)}"
    for i in range(0, len(records), batch):
        chunk = records[i : i + batch]
        payload = json.dumps(chunk, ensure_ascii=False, default=str).encode("utf-8")
        req = urllib.request.Request(
            url, data=payload,
            headers=_h({"Prefer": "resolution=merge-duplicates,return=minimal"}),
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as _:
                ok += len(chunk)
                print(f"  [{i + len(chunk)}/{len(records)}] UPSERT OK")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:400]
            print(f"  [{i + len(chunk)}/{len(records)}] FAIL HTTP {e.code}: {body}", file=sys.stderr)
    return ok


def sb_delete_by_cohort(table: str, cohort_col: str = "cohort") -> None:
    """현재 기수 데이터 삭제 (RLS가 없는 테이블에서만 동작)."""
    pattern = COHORT_FILTER.replace("%", "*")
    url = f"{SUPABASE_URL}/rest/v1/{table}?{cohort_col}=like.{urllib.parse.quote(pattern)}"
    req = urllib.request.Request(url, headers=_h(), method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=20) as _:
            pass
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"DELETE {table} 실패: HTTP {e.code} {e.read().decode()[:200]}")


def sb_insert(table: str, records: list[dict], batch: int = 200) -> int:
    ok = 0
    for i in range(0, len(records), batch):
        chunk = records[i : i + batch]
        payload = json.dumps(chunk, ensure_ascii=False, default=str).encode("utf-8")
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{table}",
            data=payload, headers=_h(), method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as _:
                ok += len(chunk)
                print(f"  [{i + len(chunk)}/{len(records)}] INSERT OK")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:400]
            print(f"  [{i + len(chunk)}/{len(records)}] FAIL HTTP {e.code}: {body}", file=sys.stderr)
    return ok


def sb_fetch(table: str, select: str = "*", limit: int = 10000) -> list[dict]:
    """Supabase에서 행 조회. Supabase 기본 제한(1000행)을 넘을 경우 자동 페이지네이션."""
    all_rows: list[dict] = []
    page = 1000  # Supabase 기본 max_rows
    offset = 0
    while len(all_rows) < limit:
        fetch = min(page, limit - len(all_rows))
        url = (
            f"{SUPABASE_URL}/rest/v1/{table}"
            f"?select={urllib.parse.quote(select)}&limit={fetch}&offset={offset}"
        )
        req = urllib.request.Request(
            url, headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            rows = json.load(r)
        all_rows.extend(rows)
        if len(rows) < fetch:
            break
        offset += fetch
    return all_rows


def sb_patch(table: str, row_id: int, data: dict) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}"
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=_h(), method="PATCH")
    with urllib.request.urlopen(req, timeout=10) as _:
        pass


# ── SQL 정의 ─────────────────────────────────────────────────────────────
# {cohort_filter} / {start_date} 는 런타임에 CONFIG 값으로 치환됩니다.
# 다른 기수 적용 시 상단 CONFIG만 수정하면 SQL은 변경 불필요.

# [0] 학생 마스터 (기수 전체 수강생)
SQL_STUDENTS = """
SELECT DISTINCT
    e.userid        AS nbcamp_user_id,   -- PK 역할. 모든 nbcamp 테이블 조인 기준
    e.onlineuserid  AS online_user_id,   -- dbonline_v3.user.mongo_user_id 와 동일
    e.name          AS student_name,
    e.marketingroundtitle AS cohort
FROM dbnbcamp_enrolleds e
WHERE e.marketingroundtitle LIKE '{cohort_filter}'
  AND e.__hevo__marked_deleted = false
ORDER BY e.name
"""

# [1] 다면평가 집계 (evaluations_users 기준 1인 1챕터 1행)
SQL_EVALUATIONS = """
SELECT
    nbcen.marketingroundtitle   AS cohort,
    nbcmy.userid                AS nbcamp_user_id,
    nbcmy.username              AS student_name,
    nbcmy.chaptertitle          AS chapter,
    t.num                       AS team_no,
    CASE WHEN t.leader = nbcmy.userid THEN '팀장' ELSE '팀원' END AS role,
    nbcmy.attitude              AS peer_communication,
    nbcmy.skill                 AS peer_skill,
    nbcmy.growth                AS peer_growth,
    nbcmy.perseverance          AS peer_immersion,
    nbcmy.selfattitude          AS self_communication,
    nbcmy.selfskill             AS self_skill,
    nbcmy.selfgrowth            AS self_growth,
    nbcmy.selfperseverance      AS self_immersion,
    nbcmy.difficulty            AS difficulty,
    nbcmy.selfcommenteffort     AS self_comment_comm_immerse,
    nbcmy.selfcommentgrowth     AS self_comment_skill_growth,
    nbcmy.promoterscore         AS nps_score,
    nbcmy.npscomment            AS nps_comment,
    nbcmy.satisfaction          AS ops_satisfaction,
    nbcmy.satisfactioncomment   AS ops_satisfaction_comment,
    nbcmy.updatedat             AS submitted_at
FROM dbnbcamp_evaluations_users nbcmy
LEFT JOIN dbnbcamp_enrolleds nbcen ON nbcen.userid = nbcmy.userid
LEFT JOIN dbnbcamp_teams     t     ON nbcmy.teamid = t._id
WHERE nbcen.marketingroundtitle LIKE '{cohort_filter}'
  AND nbcen.__hevo__marked_deleted = false
  AND nbcmy.__hevo__marked_deleted = false
  AND (t.__hevo__marked_deleted = false OR t.__hevo__marked_deleted IS NULL)
  AND nbcmy.promoterscore > -1
ORDER BY nbcmy.updatedat DESC
"""

# [2] 동료평가 개별 원본 (평가자 → 피평가자 1건씩)
# fromuserid = dbnbcamp_enrolleds.userid (FK 관계. onlineuserid 아님 주의)
SQL_PEER_COMMENTS = """
SELECT
    e.marketingroundtitle   AS cohort,
    ev.fromuserid           AS evaluator_nbcamp_id,
    ev.touserid             AS evaluated_nbcamp_id,
    ev.fromusername         AS evaluator_name,
    ev.tousername           AS evaluated_name,
    ch.title                AS chapter,
    t.num                   AS team_no,
    ev.attitudescore        AS comm_score,
    ev.perseverancescore    AS immerse_score,
    ev.attitudecomment      AS comm_skill_comment,
    ev.skillscore           AS skill_score,
    ev.growthscore          AS growth_score,
    ev.skillcomment         AS immerse_growth_comment,
    ev.createdat            AS submitted_at
FROM dbnbcamp_evaluations ev
INNER JOIN dbnbcamp_enrolleds e     ON ev.fromuserid     = e.userid
LEFT JOIN  dbnbcamp_rounds_chapters ch ON ev.roundchapterid = ch._id
LEFT JOIN  dbnbcamp_teams t         ON ev.teamid          = t._id
WHERE e.marketingroundtitle LIKE '{cohort_filter}'
  AND ev.createdat >= '{start_date}'
  AND e.__hevo__marked_deleted  = false
  AND ev.__hevo__marked_deleted = false
  AND (t.__hevo__marked_deleted = false OR t.__hevo__marked_deleted IS NULL)
  AND ev.attitudescore > -1
  AND ev.isvalid = true
  AND (ch.title NOT LIKE '%AI 디자인%' OR ch.title IS NULL)
ORDER BY ev.createdat DESC
"""

# [3] 컨디션 로그 (daily 체크인)
# 주의: temper_checks.onlineuserid 는 실제로 enrolleds.userid 값 (MongoDB 필드명 혼용)
SQL_CONDITION = """
SELECT
    tc._id                  AS mongo_id,
    e.userid                AS nbcamp_user_id,
    e.onlineuserid          AS online_user_id,
    e.name                  AS student_name,
    e.marketingroundtitle   AS cohort,
    tc.score,
    tc.content,
    tc.contactrequest       AS contact_request,
    tc.createdat            AS logged_at,
    tc.tags
FROM dbnbcamp_temper_checks tc
INNER JOIN dbnbcamp_enrolleds e ON tc.onlineuserid = e.userid
WHERE e.marketingroundtitle LIKE '{cohort_filter}'
  AND e.__hevo__marked_deleted  = false
  AND tc.__hevo__marked_deleted = false
ORDER BY tc.createdat DESC
"""

# [4] QR 출결 로그 (입퇴실 기록)
SQL_ATTENDANCE_LOG = """
SELECT
    e.marketingroundtitle   AS cohort,
    e.userid                AS nbcamp_user_id,
    e.onlineuserid          AS online_user_id,
    e.name                  AS student_name,
    qr.date,
    qr.attendancestatus     AS status,
    qr.enteredtime          AS checkin_time,
    qr.lefttime             AS checkout_time
FROM dbnbcamp_qr_daily_records qr
LEFT JOIN dbnbcamp_enrolleds e ON qr.enrolledid = e._id
WHERE e.marketingroundtitle LIKE '{cohort_filter}'
  AND qr.date >= '{start_date}'
  AND e.__hevo__marked_deleted  = false
  AND qr.__hevo__marked_deleted = false
ORDER BY qr.date DESC, e.name ASC
"""


# [5] 개인 배경 정보 (dbnbcamp_applicants + enrolleds 조인)
# user / apl1 은 SUPER 타입 → 점 표기법으로만 접근 가능
SQL_PROFILES = """
SELECT
    e.userid                    AS nbcamp_user_id,
    e.onlineuserid              AS online_user_id,
    e.name                      AS student_name,
    e.gender,
    a.user.birthday             AS birthday,
    a.apl1.currentoccupation    AS occupation,
    a.apl1.programminglevel     AS experience_level,
    a.apl1.reference            AS join_reference,
    a.apl1.painpoint            AS join_painpoint,
    a.apl1.needs                AS join_needs
FROM dbnbcamp_applicants a
INNER JOIN dbnbcamp_enrolleds e
    ON a.user.onlineuserid = e.onlineuserid
WHERE e.marketingroundtitle LIKE '{cohort_filter}'
  AND e.__hevo__marked_deleted  = false
  AND a.isvalid                 = true
  AND a.__hevo__marked_deleted  = false
ORDER BY e.name
"""

# [6] 강의 진도율 — dbonline_v3 (ds_id=21), COURSE_IDS는 런타임에 치환
SQL_LECTURE_PROGRESS = """
WITH dima_users AS (
    SELECT DISTINCT e.user_id
    FROM enrollment e
    JOIN product_component pc ON pc.id = e.product_component_id
    JOIN product p            ON p.id  = pc.product_id
    WHERE p.business_id = {business_id}
      AND p.name        = '{start_course}'
      AND DATE(e.course_start_date) = '{start_date}'
      AND e.is_canceled = false
)
SELECT
    u.mongo_user_id                         AS online_user_id,
    c.id                                    AS course_id,
    ROUND(e.progress_rate::numeric, 1)      AS progress_rate,
    e.is_completed
FROM dima_users du
JOIN "user"             u  ON u.id  = du.user_id
JOIN enrollment         e  ON e.user_id = du.user_id
                          AND e.is_canceled = false
                          AND e.course_start_date >= '{start_date}'
JOIN product_component  pc ON pc.id = e.product_component_id
JOIN product            p  ON p.id  = pc.product_id AND p.business_id = {business_id}
JOIN curriculum         cu ON cu.id = pc.component_id
JOIN course             c  ON c.id  = cu.course_id
WHERE c.id IN ({course_ids})
ORDER BY u.mongo_user_id, c.id
"""


def _fmt(sql: str) -> str:
    return sql.format(cohort_filter=COHORT_FILTER, start_date=START_DATE)


def _fmt_lecture(sql: str) -> str:
    return sql.format(
        business_id  = DIMA_BUSINESS_ID,
        start_course = DIMA_START_COURSE,
        start_date   = START_DATE,
        course_ids   = ", ".join(str(c) for c in DIMA_COURSE_IDS),
    )


# ── 개별 동기화 함수 ─────────────────────────────────────────────────────

def sync_students():
    """학생 마스터 동기화. 다른 sync 이전에 반드시 실행."""
    print("\n[학생 마스터] mj_students 동기화")
    rows = run_redash(_fmt(SQL_STUDENTS))
    ok = sb_upsert("mj_students", rows, on_conflict="nbcamp_user_id")
    print(f"  결과: {ok}/{len(rows)}건 upserted")
    _load_student_map()


def sync_evaluations():
    print("\n[다면평가] mj_evaluations 동기화")
    _ensure_student_map()
    rows = run_redash(_fmt(SQL_EVALUATIONS))
    for r in rows:
        r["student_id"] = _sid(r.get("nbcamp_user_id"))
    ok = sb_upsert("mj_evaluations", rows, on_conflict="nbcamp_user_id,chapter")
    print(f"  결과: {ok}/{len(rows)}건 upserted")
    _fill_risk_assignments_student_id()


def sync_peer_comments():
    print("\n[동료평가] mj_peer_comments 동기화")
    _ensure_student_map()
    rows = run_redash(_fmt(SQL_PEER_COMMENTS))
    for r in rows:
        r["evaluator_student_id"] = _sid(r.get("evaluator_nbcamp_id"))
        r["evaluated_student_id"] = _sid(r.get("evaluated_nbcamp_id"))
    # RLS로 DELETE 불가 → 기존 name-based unique constraint으로 UPSERT
    ok = sb_upsert(
        "mj_peer_comments", rows,
        on_conflict="evaluated_name,evaluator_name,chapter,team_no",
    )
    print(f"  결과: {ok}/{len(rows)}건 upserted")


def sync_condition():
    print("\n[컨디션] mj_condition_logs 동기화")
    _ensure_student_map()
    rows = run_redash(_fmt(SQL_CONDITION))
    records = []
    for r in rows:
        tags_raw = r.get("tags")
        if isinstance(tags_raw, str):
            try:
                tags_raw = json.loads(tags_raw)
            except Exception:
                tags_raw = None
        records.append({
            **r,
            "tags":            tags_raw,
            "contact_request": bool(r.get("contact_request")),
            "student_id":      _sid(r.get("nbcamp_user_id")),
        })
    ok = sb_upsert("mj_condition_logs", records, on_conflict="mongo_id")
    print(f"  결과: {ok}/{len(records)}건 upserted")


def sync_attendance_log():
    print("\n[QR 출결] mj_attendance_log 동기화")
    _ensure_student_map()
    rows = run_redash(_fmt(SQL_ATTENDANCE_LOG))

    def _t(v):
        return str(v)[:8] if v else None

    records = [{
        "cohort":             r.get("cohort"),
        "nbcamp_user_id":     r.get("nbcamp_user_id"),
        "online_user_id":     r.get("online_user_id"),
        "user_id":            r.get("online_user_id"),   # 하위 호환
        "student_name":       r.get("student_name"),
        "student_id":         _sid(r.get("nbcamp_user_id")),
        "date":               str(r.get("date", ""))[:10] if r.get("date") else None,
        "status":             r.get("status"),
        "checkin_time":       _t(r.get("checkin_time")),
        "checkout_time":      _t(r.get("checkout_time")),
    } for r in rows]

    sb_delete_by_cohort("mj_attendance_log")
    ok = sb_insert("mj_attendance_log", records)
    print(f"  결과: {ok}/{len(records)}건 inserted")


def fill_name_fks():
    """
    mj_attendance / mj_interview_records 처럼 nbcamp_user_id 없는 테이블을
    student_name 기준으로 student_id FK를 채웁니다.
    이름이 겹치는 경우 첫 번째 매칭만 적용됩니다.
    """
    print("\n[이름 매칭 FK] 이름 기반 student_id 채우기")
    _ensure_student_map()

    # student_name → student_id 맵 (mj_students 조회)
    students = sb_fetch("mj_students", select="id,student_name")
    name_map: dict[str, int] = {}
    for s in students:
        if s.get("student_name") and s.get("id"):
            name_map.setdefault(s["student_name"], s["id"])

    for table in ("mj_attendance", "mj_interview_records"):
        print(f"  {table} 처리 중...")
        rows = sb_fetch(table, select="id,student_name", limit=5000)
        no_id = [r for r in rows if not r.get("student_id") and r.get("student_name")]
        matched = 0
        for r in no_id:
            sid = name_map.get(r["student_name"])
            if sid:
                try:
                    sb_patch(table, r["id"], {"student_id": sid})
                    matched += 1
                except Exception as e:
                    print(f"    PATCH 실패 id={r['id']}: {e}", file=sys.stderr)
        print(f"  {table}: {matched}/{len(no_id)}건 매칭 완료")


def _strip_super(v) -> str | None:
    """Redshift SUPER 타입 문자열에서 JSON 따옴표 제거."""
    if v is None:
        return None
    s = str(v).strip('"\'')
    return s if s else None


def sync_profiles():
    """개인 배경 정보 동기화 → mj_student_profiles (1:1 with mj_students)."""
    print("\n[개인 프로필] mj_student_profiles 동기화")
    _ensure_student_map()
    rows = run_redash(_fmt(SQL_PROFILES), ds_id=DS_AWAREHOUSE)

    seen: dict[int, dict] = {}  # student_id → record (중복 제거)
    for r in rows:
        sid = _online_map.get(str(r.get("online_user_id") or "")) \
           or _sid(r.get("nbcamp_user_id"))
        if not sid or sid in seen:
            continue

        # Redshift SUPER 타입은 JSON 따옴표 포함 반환 → strip 후 변환
        bday_raw = _strip_super(r.get("birthday"))
        birthday = None
        if bday_raw and len(bday_raw) == 8 and bday_raw.isdigit():
            birthday = f"{bday_raw[:4]}-{bday_raw[4:6]}-{bday_raw[6:8]}"
        elif bday_raw and len(bday_raw) == 10 and bday_raw[4] == '-':
            birthday = bday_raw  # 이미 ISO 형식

        seen[sid] = {
            "student_id":       sid,
            "birthday":         birthday,
            "gender":           _strip_super(r.get("gender")),
            "occupation":       _strip_super(r.get("occupation")),
            "experience_level": _strip_super(r.get("experience_level")),
            "join_reference":   _strip_super(r.get("join_reference")),
            "join_painpoint":   _strip_super(r.get("join_painpoint")),
            "join_needs":       _strip_super(r.get("join_needs")),
        }

    records = list(seen.values())
    ok = sb_upsert("mj_student_profiles", records, on_conflict="student_id")
    print(f"  결과: {ok}/{len(records)}건 upserted (전체 {len(rows)}건 조회, 중복 제거 후 {len(records)}건)")


def sync_lecture_progress():
    """강의 진도율 동기화 → mj_lecture_progress (student_id × course_id)."""
    print("\n[강의 진도] mj_lecture_progress 동기화")
    _ensure_student_map()
    rows = run_redash(_fmt_lecture(SQL_LECTURE_PROGRESS), ds_id=DS_DBONLINE_V3, initial_wait=12)

    seen: dict[tuple, dict] = {}  # (student_id, course_id) → record (중복 제거, 높은 진도율 우선)
    skipped = 0
    for r in rows:
        sid = _online_map.get(str(r.get("online_user_id") or ""))
        if not sid:
            skipped += 1
            continue
        key = (sid, int(r["course_id"]))
        new_rate = float(r.get("progress_rate") or 0)
        if key not in seen or new_rate > seen[key]["progress_rate"]:
            seen[key] = {
                "student_id":    sid,
                "course_id":     int(r["course_id"]),
                "progress_rate": new_rate,
                "is_completed":  bool(r.get("is_completed")),
            }

    if skipped:
        print(f"  [경고] online_user_id 매칭 실패: {skipped}건 스킵")

    records = list(seen.values())
    ok = sb_upsert("mj_lecture_progress", records, on_conflict="student_id,course_id")
    print(f"  결과: {ok}/{len(records)}건 upserted (전체 {len(rows)}행 조회)")


def _fill_risk_assignments_student_id():
    """mj_risk_assignments.student_id를 student_name → mj_students.id 경로로 채움."""
    print("  [risk_assignments] student_id 채우기...")
    students = sb_fetch("mj_students", select="id,student_name", limit=2000)
    name_map = {s["student_name"]: s["id"] for s in students if s.get("student_name")}

    risks = sb_fetch("mj_risk_assignments", select="id,student_name,student_id", limit=2000)
    no_id = [r for r in risks if not r.get("student_id") and r.get("student_name")]
    matched = 0
    for r in no_id:
        sid = name_map.get(r["student_name"])
        if sid:
            try:
                sb_patch("mj_risk_assignments", r["id"], {"student_id": sid})
                matched += 1
            except Exception as e:
                print(f"    PATCH 실패 id={r['id']}: {e}", file=sys.stderr)
    print(f"    risk_assignments: {matched}/{len(no_id)}건 매칭")


# ── 진입점 ───────────────────────────────────────────────────────────────

TASKS = {
    "--students":  ("학생 마스터",    sync_students),
    "--profiles":  ("개인 프로필",    sync_profiles),
    "--lecture":   ("강의 진도",      sync_lecture_progress),
    "--eval":      ("다면평가",       sync_evaluations),
    "--peer":      ("동료평가",       sync_peer_comments),
    "--condition": ("컨디션",         sync_condition),
    "--qr":        ("QR 출결",        sync_attendance_log),
    "--fix-names": ("이름 FK 채우기", fill_name_fks),
}

ALL_ORDER = ["--students", "--profiles", "--lecture", "--eval", "--peer", "--condition", "--qr", "--fix-names"]


def main():
    args = set(sys.argv[1:])
    if not args or "--all" in args:
        funcs = [TASKS[k][1] for k in ALL_ORDER]
    else:
        funcs = [TASKS[a][1] for a in ALL_ORDER if a in args]
        if not funcs:
            keys = " | ".join(TASKS)
            print(f"Usage: python data_agent.py [--all | {keys}]")
            sys.exit(1)

    print(f"=== data_agent 시작 ===")
    print(f"기수 필터 : {COHORT_FILTER}")
    print(f"시작일    : {START_DATE}")

    for fn in funcs:
        fn()

    print("\n=== 전체 완료 ===")


if __name__ == "__main__":
    main()
