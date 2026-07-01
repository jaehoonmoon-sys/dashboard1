"""
ds5_data_agent.py — AI 콘텐츠 디자이너 부트캠프 5회차 데이터 동기화

Redash ad-hoc API (개인 API 키, 저장 쿼리 없음)로 AWarehouse를 직접 조회해
Supabase ds5_* 테이블에 적재합니다.

Usage:
  python ds5_data_agent.py              # 전체 동기화
  python ds5_data_agent.py --students   # 학생 마스터만
  python ds5_data_agent.py --eval       # 다면평가만
  python ds5_data_agent.py --peer       # 동료평가만
  python ds5_data_agent.py --condition  # 컨디션 로그만
  python ds5_data_agent.py --profiles   # 개인 배경 정보만
  python ds5_data_agent.py --teams      # 팀 편성만
  python ds5_data_agent.py --qr         # QR 출결 로그만
"""

import os, sys, json, time, urllib.request, urllib.parse, urllib.error
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path

# =============================================================================
# CONFIG
# =============================================================================
COHORT_FILTER   = "%AI 콘텐츠 디자이너%5%"
START_DATE      = "2026-06-08"          # 오프라인 수업 시작일
DS5_ROUNDCLASSID = "68da29aa6cdb75bd65056d6a"  # dbnbcamp_teams.roundclassid

# AI 디자인 챕터 title → ds5_chapters.code 매핑
CHAPTER_MAP = {
    "AI 디자인 온보딩": "DS5-CH1",
    "AI 디자인 입문":   "DS5-CH2",
    "AI 디자인 숙련":   "DS5-CH3",
    "AI 디자인 심화":   "DS5-CH4",
    "AI 디자인 플러스": "DS5-CH5",
    "AI 디자인 최종":   "DS5-CH6",
}
# =============================================================================

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

DS_AWAREHOUSE = 1   # Redshift (AWarehouse)

# 학생 ID 매핑 (sync_students 후 채워짐)
_student_map: dict[str, int] = {}   # nbcamp_user_id → ds5_students.id
_online_map:  dict[str, int] = {}   # online_user_id  → ds5_students.id


# ── Redash ad-hoc ─────────────────────────────────────────────────────────

def run_redash(sql: str, ds_id: int = DS_AWAREHOUSE, initial_wait: int = 10) -> list[dict]:
    """SQL을 Redash ad-hoc으로 실행하고 rows 반환."""
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
                print(f"  [{i+len(chunk)}/{len(records)}] UPSERT OK")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:400]
            print(f"  [{i+len(chunk)}/{len(records)}] FAIL HTTP {e.code}: {body}", file=sys.stderr)
    return ok


def sb_delete_where(table: str, col: str, pattern: str) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{col}=like.{urllib.parse.quote(pattern)}"
    req = urllib.request.Request(url, headers=_h(), method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=20) as _:
            pass
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"DELETE {table} 실패: HTTP {e.code} {e.read().decode()[:200]}")


def sb_delete_eq(table: str, col: str, value: str) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{col}=eq.{urllib.parse.quote(str(value))}"
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
                print(f"  [{i+len(chunk)}/{len(records)}] INSERT OK")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:400]
            print(f"  [{i+len(chunk)}/{len(records)}] FAIL HTTP {e.code}: {body}", file=sys.stderr)
    return ok


def sb_fetch(table: str, select: str = "*", limit: int = 10000) -> list[dict]:
    all_rows: list[dict] = []
    page, offset = 1000, 0
    while len(all_rows) < limit:
        fetch = min(page, limit - len(all_rows))
        url = (f"{SUPABASE_URL}/rest/v1/{table}"
               f"?select={urllib.parse.quote(select)}&limit={fetch}&offset={offset}")
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


# ── 학생 ID 매핑 ─────────────────────────────────────────────────────────

def _load_student_map() -> None:
    global _student_map, _online_map
    rows = sb_fetch("ds5_students", select="id,nbcamp_user_id,online_user_id")
    _student_map = {s["nbcamp_user_id"]: s["id"] for s in rows if s.get("nbcamp_user_id")}
    _online_map  = {s["online_user_id"]:  s["id"] for s in rows if s.get("online_user_id")}
    print(f"  학생 ID 매핑 로드: {len(_student_map)}명")


def _ensure_student_map() -> None:
    if not _student_map:
        print("  [자동] 학생 ID 매핑 로드 중...")
        _load_student_map()


def _sid(nbcamp_user_id) -> int | None:
    return _student_map.get(str(nbcamp_user_id)) if nbcamp_user_id else None


# ── SQL ───────────────────────────────────────────────────────────────────

SQL_STUDENTS = """
SELECT DISTINCT
    e.userid        AS nbcamp_user_id,
    e.onlineuserid  AS online_user_id,
    e.name          AS student_name,
    e.marketingroundtitle AS cohort
FROM dbnbcamp_enrolleds e
WHERE e.marketingroundtitle LIKE '{cohort_filter}'
  AND e.__hevo__marked_deleted = false
ORDER BY e.name
"""

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

# 디자이너는 AI 디자인 챕터가 대상이므로 ch.title 필터 없음
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
INNER JOIN dbnbcamp_enrolleds e       ON ev.fromuserid      = e.userid
LEFT JOIN  dbnbcamp_rounds_chapters ch ON ev.roundchapterid  = ch._id
LEFT JOIN  dbnbcamp_teams t            ON ev.teamid          = t._id
WHERE e.marketingroundtitle LIKE '{cohort_filter}'
  AND ev.createdat >= '{start_date}'
  AND e.__hevo__marked_deleted  = false
  AND ev.__hevo__marked_deleted = false
  AND (t.__hevo__marked_deleted = false OR t.__hevo__marked_deleted IS NULL)
  AND ev.attitudescore > -1
  AND ev.isvalid = true
ORDER BY ev.createdat DESC
"""

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

# 팀 편성: roundclassid 고정 (DS5_ROUNDCLASSID)
SQL_TEAMS = """
SELECT
    rc._id                                                      AS chapter_mongo_id,
    rc.title                                                    AS chapter_title,
    t._id                                                       AS team_mongo_id,
    t.num                                                       AS team_num,
    t.leader                                                    AS leader_user_id,
    BTRIM(m.name::varchar, '"')                                 AS member_name,
    JSON_EXTRACT_PATH_TEXT(JSON_SERIALIZE(m), 'userId')         AS member_user_id,
    JSON_EXTRACT_PATH_TEXT(JSON_SERIALIZE(m), 'enrolledId')     AS member_enrolled_id
FROM dbnbcamp_teams t
JOIN dbnbcamp_rounds_chapters rc ON rc._id = t.roundchapterid
, t.members AS m
WHERE t.roundclassid = '68da29aa6cdb75bd65056d6a'
  AND t.isactive = true
  AND t.__hevo__marked_deleted = false
  AND rc.__hevo__marked_deleted = false
ORDER BY rc.startdate, t.num, member_name
"""


def _fmt(sql: str) -> str:
    return sql.format(cohort_filter=COHORT_FILTER, start_date=START_DATE)


# ── 동기화 함수 ───────────────────────────────────────────────────────────

def sync_students():
    print("\n[학생 마스터] ds5_students 동기화")
    rows = run_redash(_fmt(SQL_STUDENTS))
    records = [{**r, "is_active": True} for r in rows]
    ok = sb_upsert("ds5_students", records, on_conflict="nbcamp_user_id")
    print(f"  결과: {ok}/{len(records)}건 upserted")
    _load_student_map()


def sync_evaluations():
    print("\n[다면평가] ds5_evaluations 동기화")
    _ensure_student_map()
    rows = run_redash(_fmt(SQL_EVALUATIONS))
    for r in rows:
        r["student_id"] = _sid(r.get("nbcamp_user_id"))
    ok = sb_upsert("ds5_evaluations", rows, on_conflict="nbcamp_user_id,chapter")
    print(f"  결과: {ok}/{len(rows)}건 upserted")


def sync_peer_comments():
    print("\n[동료평가] ds5_peer_comments 동기화")
    _ensure_student_map()
    rows = run_redash(_fmt(SQL_PEER_COMMENTS))
    for r in rows:
        r["evaluator_student_id"] = _sid(r.get("evaluator_nbcamp_id"))
        r["evaluated_student_id"] = _sid(r.get("evaluated_nbcamp_id"))
    ok = sb_upsert(
        "ds5_peer_comments", rows,
        on_conflict="evaluated_name,evaluator_name,chapter,team_no",
    )
    print(f"  결과: {ok}/{len(rows)}건 upserted")


def sync_condition():
    print("\n[컨디션] ds5_condition_logs 동기화")
    _ensure_student_map()
    rows = run_redash(_fmt(SQL_CONDITION))
    records = []
    for r in rows:
        tags_raw = r.get("tags")
        if isinstance(tags_raw, str):
            try: tags_raw = json.loads(tags_raw)
            except: tags_raw = None
        records.append({
            **r,
            "tags":            tags_raw,
            "contact_request": bool(r.get("contact_request")),
            "student_id":      _sid(r.get("nbcamp_user_id")),
        })
    ok = sb_upsert("ds5_condition_logs", records, on_conflict="mongo_id")
    print(f"  결과: {ok}/{len(records)}건 upserted")


def _strip_super(v) -> str | None:
    if v is None: return None
    s = str(v).strip('"\'')
    return s if s else None


def sync_profiles():
    print("\n[개인 프로필] ds5_student_profiles 동기화")
    _ensure_student_map()
    rows = run_redash(_fmt(SQL_PROFILES))

    seen: dict[int, dict] = {}
    for r in rows:
        sid = _online_map.get(str(r.get("online_user_id") or "")) \
           or _sid(r.get("nbcamp_user_id"))
        if not sid or sid in seen:
            continue
        bday_raw = _strip_super(r.get("birthday"))
        birthday = None
        if bday_raw and len(bday_raw) == 8 and bday_raw.isdigit():
            birthday = f"{bday_raw[:4]}-{bday_raw[4:6]}-{bday_raw[6:8]}"
        elif bday_raw and len(bday_raw) == 10 and "-" in bday_raw:
            birthday = bday_raw
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
    ok = sb_upsert("ds5_student_profiles", records, on_conflict="student_id")
    print(f"  결과: {ok}/{len(records)}건 upserted (전체 {len(rows)}행, 중복제거 후 {len(records)}건)")


def sync_attendance_log():
    print("\n[QR 출결] ds5_attendance_log 동기화")
    _ensure_student_map()
    rows = run_redash(_fmt(SQL_ATTENDANCE_LOG))

    def _t(v): return str(v)[:8] if v else None

    records = [{
        "cohort":           r.get("cohort"),
        "nbcamp_user_id":   r.get("nbcamp_user_id"),
        "online_user_id":   r.get("online_user_id"),
        "user_id":          r.get("online_user_id"),
        "student_name":     r.get("student_name"),
        "student_id":       _sid(r.get("nbcamp_user_id")),
        "date":             str(r.get("date", ""))[:10] if r.get("date") else None,
        "status":           r.get("status"),
        "checkin_time":     _t(r.get("checkin_time")),
        "checkout_time":    _t(r.get("checkout_time")),
    } for r in rows]

    # cohort 전체 삭제 후 재삽입
    cohort_pattern = COHORT_FILTER.replace("%", "*")
    sb_delete_where("ds5_attendance_log", "cohort", cohort_pattern)
    ok = sb_insert("ds5_attendance_log", records)
    print(f"  결과: {ok}/{len(records)}건 inserted")


def sync_teams():
    """팀 편성 동기화: 챕터별 stale 팀 삭제 → teams upsert → team_members 재삽입."""
    print("\n[팀 편성] ds5_teams + ds5_team_members 동기화")
    _ensure_student_map()

    rows = run_redash(SQL_TEAMS, initial_wait=12)
    if not rows:
        print("  팀 데이터 없음 — 스킵")
        return

    # 챕터별 그룹핑
    chapters: dict[str, dict] = {}   # chapter_mongo_id → {title, teams: {team_mongo_id → {...}}}
    for r in rows:
        cid = r["chapter_mongo_id"]
        if cid not in chapters:
            chapters[cid] = {"title": r.get("chapter_title", ""), "teams": {}}
        tid = r["team_mongo_id"]
        if tid not in chapters[cid]["teams"]:
            chapters[cid]["teams"][tid] = {
                "team_num":        r["team_num"],
                "leader_user_id":  r.get("leader_user_id"),
                "members":         [],
            }
        chapters[cid]["teams"][tid]["members"].append({
            "name":       r.get("member_name", ""),
            "user_id":    r.get("member_user_id", ""),
            "enrolled_id": r.get("member_enrolled_id", ""),
        })

    # ds5_chapters.mongo_chapter_id 업데이트 (나중에 route.ts에서 활용)
    for cid, chap_data in chapters.items():
        title = chap_data["title"]
        code  = CHAPTER_MAP.get(title)
        if code:
            chap_update = [{"code": code, "title": title, "mongo_chapter_id": cid}]
            sb_upsert("ds5_chapters", chap_update, on_conflict="code")

    total_teams, total_members = 0, 0
    for cid, chap_data in chapters.items():
        title     = chap_data["title"]
        code      = CHAPTER_MAP.get(title, title)
        team_dict = chap_data["teams"]

        # 기존 stale 팀 삭제 (chapter_code 기준)
        existing_raw = sb_fetch("ds5_teams", select="id,mongo_team_id,chapter_code")
        stale_ids = [r["id"] for r in existing_raw
                     if r.get("chapter_code") == code
                     and r["mongo_team_id"] not in team_dict]
        for sid in stale_ids:
            sb_delete_eq("ds5_team_members", "team_id", sid)
            sb_delete_eq("ds5_teams", "id", sid)

        # 팀 upsert
        team_records = [{
            "chapter_code":           code,
            "mongo_team_id":          tid,
            "team_num":               td["team_num"],
            "leader_nbcamp_user_id":  td.get("leader_user_id"),
            "leader_student_id":      _sid(td.get("leader_user_id")),
        } for tid, td in team_dict.items()]
        sb_upsert("ds5_teams", team_records, on_conflict="mongo_team_id")
        total_teams += len(team_records)

        # 최신 ds5_teams id 조회
        team_id_map: dict[str, int] = {
            r["mongo_team_id"]: r["id"]
            for r in sb_fetch("ds5_teams", select="id,mongo_team_id")
        }

        # team_members 재삽입
        for tid, td in team_dict.items():
            db_team_id = team_id_map.get(tid)
            if not db_team_id:
                continue
            sb_delete_eq("ds5_team_members", "team_id", db_team_id)
            leader_uid = td.get("leader_user_id")
            member_records = [{
                "team_id":           db_team_id,
                "nbcamp_enrolled_id": m["enrolled_id"],
                "nbcamp_user_id":    m["user_id"],
                "name":              m["name"],
                "is_leader":         (m["user_id"] == leader_uid),
                "student_id":        _sid(m["user_id"]),
            } for m in td["members"]]
            sb_insert("ds5_team_members", member_records)
            total_members += len(member_records)

    print(f"  결과: 팀 {total_teams}개, 팀원 {total_members}명 동기화 완료")


# ── 진입점 ───────────────────────────────────────────────────────────────

TASKS = {
    "--students":  ("학생 마스터",   sync_students),
    "--eval":      ("다면평가",      sync_evaluations),
    "--peer":      ("동료평가",      sync_peer_comments),
    "--condition": ("컨디션",        sync_condition),
    "--profiles":  ("개인 프로필",   sync_profiles),
    "--teams":     ("팀 편성",       sync_teams),
    "--qr":        ("QR 출결",       sync_attendance_log),
}

ALL_ORDER = ["--students", "--eval", "--peer", "--condition", "--profiles", "--teams", "--qr"]


def main():
    args = set(sys.argv[1:])
    if not args or "--all" in args:
        funcs = [TASKS[k][1] for k in ALL_ORDER]
    else:
        funcs = [TASKS[a][1] for a in ALL_ORDER if a in args]
        if not funcs:
            keys = " | ".join(TASKS)
            print(f"Usage: python ds5_data_agent.py [--all | {keys}]")
            sys.exit(1)

    print("=== ds5_data_agent 시작 ===")
    print(f"기수 필터 : {COHORT_FILTER}")
    print(f"시작일    : {START_DATE}")
    print(f"roundclass: {DS5_ROUNDCLASSID}")

    for fn in funcs:
        fn()

    print("\n=== 전체 완료 ===")


if __name__ == "__main__":
    main()
