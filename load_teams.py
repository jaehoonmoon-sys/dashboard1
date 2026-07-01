"""
Redash (AWarehouse) dbnbcamp_teams → Supabase mj_teams + mj_team_members 동기화
- 챕터별 전체 재동기화: 팀 추가/수정/삭제 모두 반영
- mj_chapters.mongo_chapter_id ↔ dbnbcamp_rounds_chapters._id 매핑 기반

Usage: python load_teams.py
"""
import json, urllib.request, urllib.error, time, os, sys

sys.stdout.reconfigure(encoding="utf-8")

REDASH_BASE_URL = os.getenv("REDASH_BASE_URL",  "https://redash-v2.spartacodingclub.kr")
REDASH_USER_KEY = os.getenv("redash_user_api_key", "ibiUnVAVeqvKdU6gN7Fmjf3p2wIyhWEDfNDorXge")
SUPABASE_URL    = os.getenv("NEXT_PUBLIC_SUPABASE_URL",      "https://wrcpurlzuqhssewojghw.supabase.co")
SUPABASE_KEY    = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_zDKVffzmZSlZNdgpFPPV8g_AIEA-Lvy")

DS_ID = 1  # AWarehouse (Redshift)

# 챕터별 팀 편성 + 팀원 전체 조회 (패턴 E - 데이터베이스_스키마_가이드.md)
TEAM_QUERY = """
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
WHERE t.roundclassid = '69147186ca02516451cfc29d'
  AND t.isactive = true
  AND t.__hevo__marked_deleted = false
  AND rc.__hevo__marked_deleted = false
ORDER BY rc.startdate, t.num, member_name
"""

# ─── Redash helpers ───────────────────────────────────────────────────────────

def _redash_headers():
    return {"Content-Type": "application/json", "Authorization": f"Key {REDASH_USER_KEY}"}

def run_redash_query(sql, wait_secs=8, max_polls=12):
    payload = json.dumps({"data_source_id": DS_ID, "query": sql, "max_age": 0}).encode("utf-8")
    req = urllib.request.Request(
        f"{REDASH_BASE_URL}/api/query_results",
        data=payload, headers=_redash_headers()
    )
    with urllib.request.urlopen(req) as r:
        job_id = json.loads(r.read())["job"]["id"]

    for _ in range(max_polls):
        time.sleep(wait_secs)
        req2 = urllib.request.Request(
            f"{REDASH_BASE_URL}/api/jobs/{job_id}",
            headers=_redash_headers()
        )
        with urllib.request.urlopen(req2) as r:
            job = json.loads(r.read())["job"]
        if job.get("query_result_id"):
            req3 = urllib.request.Request(
                f"{REDASH_BASE_URL}/api/query_results/{job['query_result_id']}",
                headers=_redash_headers()
            )
            with urllib.request.urlopen(req3) as r:
                return json.loads(r.read())["query_result"]["data"]["rows"]
        if job.get("status") == 4:
            raise RuntimeError(f"Redash query failed: {job.get('error')}")
    raise TimeoutError("Redash query timed out")

# ─── Supabase helpers ─────────────────────────────────────────────────────────

def _supa_headers(extra=None):
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    if extra:
        h.update(extra)
    return h

def supa_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    req = urllib.request.Request(url, headers=_supa_headers())
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def supa_upsert(table, records):
    if not records:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    payload = json.dumps(records, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=_supa_headers({
        "Content-Type": "application/json; charset=utf-8",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        print(f"  UPSERT ERROR {e.code}: {body}", file=sys.stderr)
        return e.code

def supa_delete(table, query_params):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query_params}"
    req = urllib.request.Request(url, headers=_supa_headers({
        "Prefer": "return=minimal",
    }), method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        print(f"  DELETE ERROR {e.code}: {body}", file=sys.stderr)
        return e.code

# ─── main ─────────────────────────────────────────────────────────────────────

def main():
    # 1. Redash에서 팀 편성 원본 조회
    print("Fetching team data from Redash...")
    rows = run_redash_query(TEAM_QUERY)
    print(f"  Total rows fetched: {len(rows)}")

    # 2. 챕터 → 팀 → 팀원 계층 구조로 재편성
    chapters: dict = {}
    for row in rows:
        cid = row["chapter_mongo_id"]
        tid = row["team_mongo_id"]
        if cid not in chapters:
            chapters[cid] = {"title": row["chapter_title"], "teams": {}}
        if tid not in chapters[cid]["teams"]:
            chapters[cid]["teams"][tid] = {
                "team_num":      row["team_num"],
                "leader_user_id": row["leader_user_id"],
                "members":       [],
            }
        chapters[cid]["teams"][tid]["members"].append({
            "nbcamp_enrolled_id": row["member_enrolled_id"],
            "nbcamp_user_id":     row["member_user_id"],
            "name":               row["member_name"],
            "is_leader":          row["member_user_id"] == row["leader_user_id"],
        })

    # 3. mj_students 조회 → nbcamp_user_id: supabase_id 매핑
    print("Loading mj_students lookup...")
    students = supa_get("mj_students", "?select=id,nbcamp_user_id&nbcamp_user_id=not.is.null")
    user_to_sid: dict = {s["nbcamp_user_id"]: s["id"] for s in students}

    # 4. mj_chapters 조회 → mongo_chapter_id: chapter_code 매핑
    print("Loading mj_chapters lookup...")
    chap_rows = supa_get("mj_chapters", "?select=code,mongo_chapter_id&mongo_chapter_id=not.is.null")
    mongo_to_code: dict = {c["mongo_chapter_id"]: c["code"] for c in chap_rows}

    # 5. 챕터별 동기화
    total_teams = total_members = 0

    for chapter_mongo_id, chapter_data in chapters.items():
        chapter_code = mongo_to_code.get(chapter_mongo_id)
        if not chapter_code:
            print(f"  SKIP: chapter {chapter_mongo_id} not mapped in mj_chapters")
            continue

        print(f"\n[{chapter_code}] {chapter_data['title']}")
        current_ids = set(chapter_data["teams"].keys())

        # 5-1. 이 챕터에서 사라진 팀 삭제 (ON DELETE CASCADE → 팀원도 자동 삭제)
        existing = supa_get("mj_teams", f"?select=id,mongo_team_id&chapter_code=eq.{chapter_code}")
        stale = [t["id"] for t in existing if t["mongo_team_id"] not in current_ids]
        if stale:
            ids_str = ",".join(str(i) for i in stale)
            supa_delete("mj_teams", f"id=in.({ids_str})")
            print(f"  Removed {len(stale)} stale team(s)")

        # 5-2. 현재 팀 upsert (ON CONFLICT mongo_team_id)
        team_records = []
        for team_mongo_id, team in chapter_data["teams"].items():
            leader_sid = user_to_sid.get(team["leader_user_id"])
            leader_name = next(
                (m["name"] for m in team["members"] if m["is_leader"]), None
            )
            team_records.append({
                "chapter_code":          chapter_code,
                "mongo_team_id":         team_mongo_id,
                "team_num":              team["team_num"],
                "leader_name":           leader_name,
                "leader_nbcamp_user_id": team["leader_user_id"],
                "leader_student_id":     leader_sid,
            })

        supa_upsert("mj_teams", team_records)
        print(f"  Upserted {len(team_records)} teams")
        total_teams += len(team_records)

        # 5-3. 팀원 재동기화: 각 팀별 DELETE → INSERT
        #       (팀원 추가/제거/변경 모두 처리)
        refreshed = supa_get("mj_teams", f"?select=id,mongo_team_id&chapter_code=eq.{chapter_code}")
        mongo_to_team_id: dict = {t["mongo_team_id"]: t["id"] for t in refreshed}

        chapter_member_count = 0
        for team_mongo_id, team in chapter_data["teams"].items():
            team_id = mongo_to_team_id.get(team_mongo_id)
            if not team_id:
                continue
            supa_delete("mj_team_members", f"team_id=eq.{team_id}")

            member_records = [{
                "team_id":            team_id,
                "nbcamp_enrolled_id": m["nbcamp_enrolled_id"],
                "nbcamp_user_id":     m["nbcamp_user_id"],
                "name":               m["name"],
                "is_leader":          m["is_leader"],
                "student_id":         user_to_sid.get(m["nbcamp_user_id"]),
            } for m in team["members"]]

            supa_upsert("mj_team_members", member_records)
            chapter_member_count += len(member_records)

        print(f"  Synced {chapter_member_count} members")
        total_members += chapter_member_count

    print(f"\nDone: {total_teams} teams, {total_members} members synced across {len(chapters)} chapters")

if __name__ == "__main__":
    main()
