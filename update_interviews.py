import os
import json
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

# .env.local 로드 (python-dotenv 없이)
def _load_env_local():
    env_file = Path(__file__).parent / ".env.local"
    if not env_file.exists():
        return
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

_load_env_local()

try:
    from notion_client import Client as NotionClient
except ImportError:
    print("ERROR: notion-client 패키지가 필요합니다.")
    print("       pip install notion-client")
    raise

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
NOTION_TOKEN = os.environ["notion_api_key"]

# 면담 기록 DB의 data_source_id (변경 금지 — data_sources.query용 내부 ID)
# 원본 DB: https://www.notion.so/teamsparta/30b2dc3ef514815eab3addceb673ed8c
NOTION_DATA_SOURCE_ID = "30b2dc3e-f514-815d-8068-000b27bcf5f6"


# ── 노션 읽기 전용 함수들 ──────────────────────────────────────────────────────

def _fetch_all_pages(notion: NotionClient) -> list:
    """면담 DB의 모든 페이지를 읽어온다."""
    pages = []
    cursor = None
    while True:
        kwargs: dict = {}
        if cursor:
            kwargs["start_cursor"] = cursor
        resp = notion.data_sources.query(NOTION_DATA_SOURCE_ID, **kwargs)
        pages.extend(resp.get("results", []))
        if not resp.get("has_more"):
            break
        cursor = resp.get("next_cursor")
    return pages


def _block_to_md(block: dict, indent: str = "") -> str:
    btype = block.get("type", "")
    inner = block.get(btype, {})
    text = "".join(t.get("plain_text", "") for t in inner.get("rich_text", []))
    if btype == "paragraph":
        return f"{indent}{text}\n" if text else "\n"
    elif btype == "heading_1":
        return f"# {text}\n"
    elif btype == "heading_2":
        return f"## {text}\n"
    elif btype == "heading_3":
        return f"### {text}\n"
    elif btype == "bulleted_list_item":
        return f"{indent}- {text}\n"
    elif btype == "numbered_list_item":
        return f"{indent}1. {text}\n"
    elif btype == "to_do":
        checked = "x" if inner.get("checked") else " "
        return f"{indent}- [{checked}] {text}\n"
    elif btype == "quote":
        return f"{indent}> {text}\n"
    elif btype == "code":
        lang = inner.get("language", "")
        return f"```{lang}\n{text}\n```\n"
    elif btype == "divider":
        return "---\n"
    else:
        return f"{indent}{text}\n" if text else ""


def _fetch_page_markdown(notion: NotionClient, page_id: str, depth: int = 0) -> str:
    """페이지 본문을 블록 재귀 조회로 마크다운으로 변환한다."""
    if depth > 5:
        return ""
    blocks = []
    cursor = None
    while True:
        kwargs: dict = {"block_id": page_id, "page_size": 100}
        if cursor:
            kwargs["start_cursor"] = cursor
        resp = notion.blocks.children.list(**kwargs)
        blocks.extend(resp.get("results", []))
        if not resp.get("has_more"):
            break
        cursor = resp.get("next_cursor")
    indent = "  " * depth
    parts = []
    for block in blocks:
        parts.append(_block_to_md(block, indent))
        if block.get("has_children"):
            parts.append(_fetch_page_markdown(notion, block["id"], depth + 1))
    return "".join(parts)


def _extract_props(page: dict) -> dict:
    """노션 페이지 properties를 Supabase 컬럼에 맞게 추출한다."""
    props = page.get("properties", {})

    def text(p: dict) -> str | None:
        items = p.get("rich_text") or p.get("title") or []
        val = "".join(t.get("plain_text", "") for t in items)
        return val or None

    def date_start(p: dict) -> str | None:
        return (p.get("date") or {}).get("start")

    def select_name(p: dict) -> str | None:
        return (p.get("select") or {}).get("name")

    def multi_select(p: dict) -> list[str]:
        return [s["name"] for s in (p.get("multi_select") or []) if s.get("name")]

    def people_names(p: dict) -> str | None:
        names = [u.get("name") for u in (p.get("people") or []) if u.get("name")]
        return ", ".join(names) if names else None

    return {
        "student_name": text(props.get("수강생", {})),
        "interview_date": date_start(props.get("면담일자", {})),
        "chapter": select_name(props.get("챕터", {})),
        "summary": text(props.get("요약", {})),
        "types": multi_select(props.get("유형", {})),
        "interviewer": people_names(props.get("면담자", {})),
    }


# ── Supabase upsert ────────────────────────────────────────────────────────────

def _upsert(record: dict) -> int:
    url = f"{SUPABASE_URL}/rest/v1/mj_interview_records?on_conflict=notion_url"
    payload = json.dumps(record, ensure_ascii=False).encode("utf-8")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:300]
        print(f"  FAIL {record.get('notion_url', '')[-12:]}: HTTP {e.code} - {body}")
        return e.code


# ── 메인 ──────────────────────────────────────────────────────────────────────

def main() -> None:
    notion = NotionClient(auth=NOTION_TOKEN)

    print(f"노션 면담 DB 조회 중...")
    pages = _fetch_all_pages(notion)
    print(f"총 {len(pages)}건 발견\n")

    ok = fail = 0
    for page in pages:
        page_id = page["id"]
        notion_url = "https://www.notion.so/" + page_id.replace("-", "")

        props = _extract_props(page)
        content = _fetch_page_markdown(notion, page_id)

        record = {"notion_url": notion_url, "content": content, **props}
        status = _upsert(record)

        name = props.get("student_name") or "이름 없음"
        date = props.get("interview_date") or "날짜 없음"
        if status in (200, 201, 204):
            ok += 1
            print(f"  OK  {name} ({date})")
        else:
            fail += 1
            print(f"  FAIL {name} ({date}) → HTTP {status}")

    print(f"\n완료: {ok}건 성공 / {fail}건 실패 (전체 {len(pages)}건)")


if __name__ == "__main__":
    main()
