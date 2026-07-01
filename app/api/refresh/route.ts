import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const REDASH_BASE = (process.env.REDASH_BASE_URL ?? 'https://redash-v2.spartacodingclub.kr').replace(/\/$/, '');
const env = process.env as Record<string, string | undefined>;

// Redash 키
const EVAL_KEY       = env.REDASH_API_KEY ?? '';
const EVAL_QID       = env.REDASH_QUERY_ID ?? env['redash_query_id'] ?? '7200';
const COND_KEY       = env.REDASH_API_KEY_2 ?? env['redash-api-key-2'] ?? '';
const PEER_KEY       = env.REDASH_API_KEY_3 ?? env['redash-api-key-3'] ?? '';
const USER_KEY       = env.REDASH_USER_API_KEY ?? env['redash_user_api_key'] ?? '';
const ATTEND_LOG_KEY = env.REDASH_API_KEY_4 ?? env['redash-api-key-4'] ?? '';
const ATTEND_LOG_QID = env.REDASH_QUERY_ID_4 ?? env['redash_query_id_4'] ?? '7225';

// 구글 서비스 계정
const SHEET_ID = process.env.ATTENDANCE_SHEET_ID ?? '';
const SHEET_GID = process.env.ATTENDANCE_GID ?? '';
const SA_EMAIL = process.env.GOOGLE_CLIENT_EMAIL ?? '';
const SA_PKEY  = (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').replace(/\r/g, '');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ── Google OAuth (Service Account JWT) ────────────────────────────────────────

async function getGoogleToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim  = Buffer.from(JSON.stringify({
    iss:   SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  })).toString('base64url');

  const msg = `${header}.${claim}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(msg);
  const privateKey = crypto.createPrivateKey({ key: SA_PKEY, format: 'pem' });
  const sig = sign.sign(privateKey, 'base64url');
  const jwt = `${msg}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });
  const data = await res.json() as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`Google auth 실패: ${data.error}`);
  return data.access_token;
}

// ── 구글 시트 읽기 ────────────────────────────────────────────────────────────

async function fetchSheet(token: string): Promise<string[][]> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
  );
  const meta = await metaRes.json() as { sheets: { properties: { sheetId: number; title: string } }[] };
  const sheetName = meta.sheets.find(s => s.properties.sheetId === parseInt(SHEET_GID))?.properties?.title;
  if (!sheetName) throw new Error(`GID ${SHEET_GID} 탭을 찾을 수 없음`);

  const rangeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${sheetName}!A1:ZZ`)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
  );
  const rangeData = await rangeRes.json() as { values?: string[][] };
  return rangeData.values ?? [];
}

// ── 날짜 파싱: "4. 20 월" → "2026-04-20" ─────────────────────────────────────

function parseDate(header: string): string | null {
  const m = header.match(/(\d+)\.\s*(\d+)/);
  if (!m) return null;
  const month = parseInt(m[1]);
  const day   = parseInt(m[2]);
  const year  = new Date().getFullYear();
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── 출결 셀 파싱: "결석-여행일정" → { type, reason } ─────────────────────────

const KNOWN_TYPES = new Set(['지각', '결석', '조퇴', '공가', '외출']);

function parseCell(cell: string): { type: string; reason: string | null } {
  cell = cell.trim();
  for (const sep of [' - ', '-', ' ']) {
    const idx = cell.indexOf(sep);
    if (idx !== -1) {
      const left  = cell.slice(0, idx).trim();
      const right = cell.slice(idx + sep.length).trim();
      if (KNOWN_TYPES.has(left)) return { type: left, reason: right || null };
    }
  }
  return { type: cell, reason: null };
}

// ── Redash 쿼리 재실행 + 결과 반환 ────────────────────────────────────────────

type RedashRow = Record<string, unknown>;

async function fetchRedashWithRefresh(queryId: string, readKey: string): Promise<RedashRow[]> {
  const refreshRes = await fetch(
    `${REDASH_BASE}/api/queries/${queryId}/refresh?api_key=${USER_KEY}`,
    { method: 'POST', cache: 'no-store' }
  );
  if (!refreshRes.ok) throw new Error(`Redash refresh HTTP ${refreshRes.status}`);
  const { job } = await refreshRes.json() as { job: { id: string } };
  if (!job?.id) throw new Error('Redash job ID 없음');

  // 최대 3분(90회 × 2초) 폴링
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const jobRes = await fetch(`${REDASH_BASE}/api/jobs/${job.id}?api_key=${USER_KEY}`, { cache: 'no-store' });
    const { job: j } = await jobRes.json() as { job: { status: number } };
    if (j.status === 3) {
      const res = await fetch(`${REDASH_BASE}/api/queries/${queryId}/results.json?api_key=${readKey}`, { cache: 'no-store' });
      const data = await res.json() as { query_result: { data: { rows: RedashRow[] } } };
      return data.query_result.data.rows ?? [];
    }
    if (j.status === 4) throw new Error('Redash 쿼리 실패');
    if (j.status === 5) throw new Error('Redash 쿼리 취소');
  }

  // 3분 내 완료 안 됨 → Redash job은 백그라운드에서 계속 실행 중
  // 에러 대신 마지막 캐시 결과를 반환 (다음 새로고침 시 최신 결과가 들어옴)
  try {
    const cached = await fetchRedashCached(queryId, readKey);
    if (cached.length > 0) return cached;
  } catch {
    // 캐시도 없으면 빈 배열 반환 (upsert 0건 처리)
  }
  throw new Error('Redash 3분 초과 — 백그라운드 실행 중, 잠시 후 재시도');
}

// ── Redash 캐시 결과만 조회 ────────────────────────────────────────────────────

async function fetchRedashCached(queryId: string, readKey: string): Promise<RedashRow[]> {
  const res = await fetch(
    `${REDASH_BASE}/api/queries/${queryId}/results.json?api_key=${readKey}`,
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Redash HTTP ${res.status}`);
  const data = await res.json() as { query_result: { data: { rows: RedashRow[] } } };
  return data.query_result.data.rows ?? [];
}

function parseJsonField(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return null; }
}

// ── 노션 면담 기록 sync ────────────────────────────────────────────────────────

const NOTION_TOKEN = env.notion_api_key ?? '';
const NOTION_DB_ID = '30b2dc3e-f514-815e-ab3a-ddceb673ed8c';
const NOTION_VER   = '2022-06-28';

type NotionRichText = Array<{ plain_text: string }>;
type NotionBlock = { type: string } & Record<string, unknown>;

function notionRichTextToStr(rt: NotionRichText): string {
  return rt.map(t => t.plain_text).join('');
}

function blockToMd(block: NotionBlock, indent = ''): string {
  const type = block.type;
  const inner = (block[type] ?? {}) as {
    rich_text?: NotionRichText;
    checked?: boolean;
    language?: string;
  };
  const text = notionRichTextToStr(inner.rich_text ?? []);
  switch (type) {
    case 'paragraph':          return text ? `${indent}${text}\n` : '\n';
    case 'heading_1':          return `# ${text}\n`;
    case 'heading_2':          return `## ${text}\n`;
    case 'heading_3':          return `### ${text}\n`;
    case 'bulleted_list_item': return `${indent}- ${text}\n`;
    case 'numbered_list_item': return `${indent}1. ${text}\n`;
    case 'to_do':              return `${indent}- [${inner.checked ? 'x' : ' '}] ${text}\n`;
    case 'quote':              return `${indent}> ${text}\n`;
    case 'code':               return `\`\`\`${inner.language ?? ''}\n${text}\n\`\`\`\n`;
    case 'divider':            return '---\n';
    case 'callout':            return `${indent}> ${text}\n`;
    case 'toggle':             return text ? `${indent}${text}\n` : '';
    default:                   return text ? `${indent}${text}\n` : '';
  }
}

type NotionPage = { id: string; last_edited_time: string; properties: Record<string, unknown> };

async function notionFetchPages(since?: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  while (true) {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (since) {
      body.filter = {
        timestamp: 'last_edited_time',
        last_edited_time: { after: since },
      };
    }
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': NOTION_VER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Notion DB query HTTP ${res.status}`);
    const data = await res.json() as {
      results: NotionPage[];
      has_more: boolean;
      next_cursor?: string;
    };
    pages.push(...data.results);
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return pages;
}

async function notionFetchPageContent(blockId: string, depth = 0): Promise<string> {
  if (depth > 5) return '';
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;
  while (true) {
    const qs = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : '?page_size=100';
    const res = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children${qs}`, {
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': NOTION_VER,
      },
      cache: 'no-store',
    });
    if (!res.ok) break;
    const data = await res.json() as { results: NotionBlock[]; has_more: boolean; next_cursor?: string };
    blocks.push(...data.results);
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  const indent = '  '.repeat(depth);
  const parts: string[] = [];
  for (const block of blocks) {
    parts.push(blockToMd(block, indent));
    if ((block as Record<string, unknown>).has_children) {
      const childId = (block as Record<string, unknown>).id as string;
      parts.push(await notionFetchPageContent(childId, depth + 1));
    }
  }
  return parts.join('');
}

function notionExtractProps(properties: Record<string, unknown>) {
  const rt = (p: unknown): string | null => {
    const prop = p as Record<string, unknown> | null;
    if (!prop) return null;
    const items = (prop.rich_text ?? prop.title ?? []) as NotionRichText;
    const val = items.map(t => t.plain_text).join('');
    return val || null;
  };
  const dateStart = (p: unknown): string | null => {
    const prop = p as Record<string, unknown> | null;
    return (prop?.date as Record<string, string> | null)?.start ?? null;
  };
  const sel = (p: unknown): string | null => {
    const prop = p as Record<string, unknown> | null;
    return (prop?.select as Record<string, string> | null)?.name ?? null;
  };
  const multiSel = (p: unknown): string[] => {
    const prop = p as Record<string, unknown> | null;
    return ((prop?.multi_select as Array<{ name: string }> | null) ?? []).map(s => s.name);
  };
  const people = (p: unknown): string | null => {
    const prop = p as Record<string, unknown> | null;
    const names = ((prop?.people as Array<{ name: string }> | null) ?? [])
      .map(u => u.name).filter((n): n is string => !!n);
    return names.length ? names.join(', ') : null;
  };
  return {
    student_name:   rt(properties['수강생']),
    interview_date: dateStart(properties['면담일자']),
    chapter:        sel(properties['챕터']),
    summary:        rt(properties['요약']),
    types:          multiSel(properties['유형']),
    interviewer:    people(properties['면담자']),
  };
}

// ── Redash 즉석 SQL 실행 (저장 쿼리 없이 개인 API 키로) ──────────────────────

const TEAM_SQL = `
SELECT
    rc._id                                                      AS chapter_mongo_id,
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
`;

async function fetchRedashAdHoc(sql: string): Promise<RedashRow[]> {
  const res = await fetch(`${REDASH_BASE}/api/query_results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${USER_KEY}` },
    body: JSON.stringify({ data_source_id: 1, query: sql, max_age: 0 }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Redash ad-hoc HTTP ${res.status}`);
  const { job } = await res.json() as { job: { id: string } };

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const jr = await fetch(`${REDASH_BASE}/api/jobs/${job.id}?api_key=${USER_KEY}`, { cache: 'no-store' });
    const { job: j } = await jr.json() as { job: { status: number; query_result_id?: number; error?: string } };
    if (j.status === 3 && j.query_result_id) {
      const dr = await fetch(`${REDASH_BASE}/api/query_results/${j.query_result_id}`, {
        headers: { 'Authorization': `Key ${USER_KEY}` }, cache: 'no-store',
      });
      const d = await dr.json() as { query_result: { data: { rows: RedashRow[] } } };
      return d.query_result.data.rows ?? [];
    }
    if (j.status === 4) throw new Error(`Redash query failed: ${j.error}`);
  }
  throw new Error('Redash ad-hoc query timeout (90s)');
}

// ── POST /api/refresh ─────────────────────────────────────────────────────────

export async function POST() {
  const results: Record<string, unknown> = {};

  // 0. Redash 다면평가(7200) → dm5_evaluations
  try {
    const rows = await fetchRedashWithRefresh(EVAL_QID, EVAL_KEY);
    const now = new Date().toISOString();
    const records = rows
      .filter(r => r['이름'] && r['기수명'])
      .map(r => ({
        cohort:                    r['기수명']              as string,
        student_name:              r['이름']                as string,
        chapter:                   r['챕터']                as string | null,
        team_no:                   r['팀 번호']             as number | null,
        role:                      r['역할']                as string | null,
        peer_communication:        r['소통']                as number | null,
        self_communication:        r['자평_소통점수']       as number | null,
        peer_skill:                r['실력']                as number | null,
        self_skill:                r['자평_실력점수']       as number | null,
        peer_growth:               r['성장']                as number | null,
        self_growth:               r['자평_성장점수']       as number | null,
        peer_immersion:            r['몰입']                as number | null,
        self_immersion:            r['자평_몰입점수']       as number | null,
        difficulty:                r['난이도']              as number | null,
        self_comment_comm_immerse: r['자평_소통/몰입코멘트'] as string | null,
        self_comment_skill_growth: r['자평_실력/성장코멘트'] as string | null,
        nps_score:                 r['nps_점수']            as number | null,
        nps_comment:               r['nps_코멘트']          as string | null,
        ops_satisfaction:          r['운영_만족도']         as number | null,
        ops_satisfaction_comment:  r['운영_만족도_코멘트']  as string | null,
        submitted_at:              r['제출일시']            as string | null,
        synced_at:                 now,
      }));

    let upserted = 0;
    for (let i = 0; i < records.length; i += 200) {
      const { error } = await supabase
        .from('dm5_evaluations')
        .upsert(records.slice(i, i + 200), { onConflict: 'cohort,student_name,chapter,submitted_at' });
      if (error) throw new Error(error.message);
      upserted += Math.min(200, records.length - i);
    }
    results.evaluations = { ok: true, upserted };
  } catch (e) {
    results.evaluations = { error: String(e) };
  }

  // 1. 구글시트 출결 → dm5_attendance
  try {
    const token  = await getGoogleToken();
    const rows   = await fetchSheet(token);
    const header = rows[1] ?? [];
    const today  = new Date().toISOString().slice(0, 10);

    const dateCols = new Map<number, string>();
    for (let i = 6; i < header.length; i++) {
      const d = parseDate(header[i]);
      if (d) dateCols.set(i, d);
    }

    const records: Record<string, unknown>[] = [];
    for (const row of rows.slice(2)) {
      if (!row?.[0]) continue;
      const studentNo = parseInt(row[0]);
      if (isNaN(studentNo)) continue;
      const studentName = row[1]?.trim() ?? '';
      if (!studentName) continue;

      const teamNo             = row[2]?.trim() && /^\d+$/.test(row[2].trim()) ? parseInt(row[2]) : null;
      const note               = row[3]?.trim() || null;
      const absenceRatePeriod  = row[4]?.trim() || null;
      const absenceRateTotal   = row[5]?.trim() || null;

      for (const [colIdx, dateStr] of dateCols) {
        const cellVal = (row[colIdx] ?? '').trim();
        let type: string, reason: string | null;
        if (!cellVal) {
          if (dateStr > today) continue;
          type = '출석'; reason = null;
        } else {
          ({ type, reason } = parseCell(cellVal));
        }
        records.push({
          student_no: studentNo, student_name: studentName,
          team_no: teamNo, note,
          absence_rate_period: absenceRatePeriod, absence_rate_total: absenceRateTotal,
          date: dateStr, type, reason,
        });
      }
    }

    let upserted = 0;
    for (let i = 0; i < records.length; i += 200) {
      const { error } = await supabase
        .from('dm5_attendance')
        .upsert(records.slice(i, i + 200), { onConflict: 'student_no,date' });
      if (error) throw new Error(error.message);
      upserted += Math.min(200, records.length - i);
    }
    results.attendance = { ok: true, upserted, dateCols: dateCols.size };
  } catch (e) {
    results.attendance = { error: String(e) };
  }

  // 2. Redash 출결 로그 → dm5_attendance_log
  try {
    const rows = await fetchRedashCached(ATTEND_LOG_QID, ATTEND_LOG_KEY);
    const records = rows
      .filter(r => r['출결일자'])
      .map(r => ({
        cohort:        r['기수명']  ?? null,
        student_name:  r['이름']    ?? null,
        user_id:       r['유저id']  ?? null,
        date:          String(r['출결일자']).slice(0, 10),
        status:        r['출결상태'] ?? null,
        checkin_time:  r['입실시간'] ?? null,
        checkout_time: r['퇴실시간'] ?? null,
      }));

    let upserted = 0;
    for (let i = 0; i < records.length; i += 200) {
      const { error } = await supabase
        .from('dm5_attendance_log')
        .upsert(records.slice(i, i + 200), { onConflict: 'user_id,date' });
      if (error) throw new Error(error.message);
      upserted += Math.min(200, records.length - i);
    }
    results.attendanceLog = { ok: true, upserted };
  } catch (e) {
    results.attendanceLog = { error: String(e) };
  }

  // 3. Redash 컨디션 → dm5_condition_logs
  try {
    const rows = await fetchRedashWithRefresh('7212', COND_KEY);
    const rawRecords = rows
      .filter(r => !r['__hevo__marked_deleted'])
      .map(r => ({
        student_name:   r['수강생_이름'] as string | null,
        online_user_id: r['onlineuserid'] as string | null,
        score:          r['score'] as number | null,
        content:        r['content'] as string | null,
        contact_request:(r['contactrequest'] as boolean | null) ?? false,
        tags:           parseJsonField(r['tags']),
        logged_at:      r['createdat'] as string | null,
        mongo_id:       r['_id'] as string,
      }));
    // 동일 배치 내 mongo_id 중복 시 "ON CONFLICT DO UPDATE command cannot affect row a second time" 발생 방지
    const seen = new Map<string, typeof rawRecords[0]>();
    for (const rec of rawRecords) seen.set(rec.mongo_id, rec);
    const records = Array.from(seen.values());
    let upserted = 0;
    for (let i = 0; i < records.length; i += 200) {
      const { error } = await supabase
        .from('dm5_condition_logs')
        .upsert(records.slice(i, i + 200), { onConflict: 'mongo_id' });
      if (error) throw new Error(error.message);
      upserted += Math.min(200, records.length - i);
    }
    results.condition = { ok: true, upserted };
  } catch (e) {
    results.condition = { error: String(e) };
  }

  // 4. Redash 동료평가 → dm5_peer_comments
  try {
    const rows = await fetchRedashWithRefresh('7208', PEER_KEY);
    const records = rows.map(r => ({
      cohort:                r['기수명']          as string | null,
      evaluator_name:        r['평가자_성함']      as string,
      evaluated_name:        r['피평가자_성함']    as string,
      chapter:               r['챕터명']           as string | null,
      team_no:               r['팀 번호']          as number | null,
      comm_score:            r['소통_점수']         as number | null,
      skill_score:           r['실력_점수']         as number | null,
      comm_skill_comment:    r['소통/몰입_코멘트']  as string | null,
      immerse_score:         r['몰입_점수']         as number | null,
      growth_score:          r['성장_점수']         as number | null,
      immerse_growth_comment:r['실력/성장_코멘트']  as string | null,
      submitted_at:          r['평가일시']          as string | null,
    }));
    let upserted = 0;
    for (let i = 0; i < records.length; i += 200) {
      const { error } = await supabase
        .from('dm5_peer_comments')
        .upsert(records.slice(i, i + 200), { onConflict: 'evaluator_name,evaluated_name,chapter' });
      if (error) throw new Error(error.message);
      upserted += Math.min(200, records.length - i);
    }
    results.peer = { ok: true, upserted };
  } catch (e) {
    results.peer = { error: String(e) };
  }

  // 5. 노션 면담 기록 → dm5_interview_records (항상 전체 동기화 — 수정 반영을 위해 필터 없이 전체 조회)
  try {
    const pages = await notionFetchPages();

    // (student_name, interview_date) 기준 중복 제거 — 같은 면담이 Notion에 여러 페이지로 존재할 경우
    // last_edited_time이 최신인 페이지 하나만 남김
    const latestById = new Map<string, NotionPage>();
    for (const page of pages) {
      const props = notionExtractProps(page.properties);
      const key = `${props.student_name ?? ''}__${props.interview_date ?? ''}`;
      const existing = latestById.get(key);
      if (!existing || page.last_edited_time > existing.last_edited_time) {
        latestById.set(key, page);
      }
    }
    const selectedPages = Array.from(latestById.values());

    const now = new Date().toISOString();
    let upserted = 0;
    for (const page of selectedPages) {
      const notionUrl = 'https://www.notion.so/' + page.id.replace(/-/g, '');
      const props = notionExtractProps(page.properties);

      // DB에 같은 student+date지만 다른 notion_url인 잔여 중복 레코드 제거
      if (props.student_name && props.interview_date) {
        await supabase
          .from('dm5_interview_records')
          .delete()
          .eq('student_name', props.student_name)
          .eq('interview_date', props.interview_date)
          .neq('notion_url', notionUrl);
      }

      const content = await notionFetchPageContent(page.id);
      const { error } = await supabase
        .from('dm5_interview_records')
        .upsert({ notion_url: notionUrl, content, synced_at: now, ...props }, { onConflict: 'notion_url' });
      if (error) throw new Error(error.message);
      upserted++;
    }
    results.interviews = { ok: true, upserted };
  } catch (e) {
    results.interviews = { error: String(e) };
  }

  // 6. Redash (AWarehouse 즉석 쿼리) → dm5_teams + dm5_team_members
  try {
    const rows = await fetchRedashAdHoc(TEAM_SQL);

    // 챕터 → 팀 → 팀원 계층 구조로 재편성
    type Member = { nbcamp_enrolled_id: string; nbcamp_user_id: string; name: string; is_leader: boolean };
    type TeamEntry = { team_num: number; leader_user_id: string; members: Member[] };
    const chapters = new Map<string, Map<string, TeamEntry>>();

    for (const row of rows) {
      const cid = row['chapter_mongo_id'] as string;
      const tid = row['team_mongo_id'] as string;
      if (!chapters.has(cid)) chapters.set(cid, new Map());
      const teams = chapters.get(cid)!;
      if (!teams.has(tid)) {
        teams.set(tid, { team_num: row['team_num'] as number, leader_user_id: row['leader_user_id'] as string, members: [] });
      }
      const team = teams.get(tid)!;
      const uid = row['member_user_id'] as string;
      team.members.push({
        nbcamp_enrolled_id: row['member_enrolled_id'] as string,
        nbcamp_user_id: uid,
        name: row['member_name'] as string,
        is_leader: uid === team.leader_user_id,
      });
    }

    // 룩업: mongo_chapter_id → chapter_code
    const { data: chapData } = await supabase
      .from('dm5_chapters').select('code, mongo_chapter_id').not('mongo_chapter_id', 'is', null);
    const mongoToCode = new Map((chapData ?? []).map(c => [c.mongo_chapter_id as string, c.code as string]));

    // 룩업: nbcamp_user_id → dm5_students.id
    const { data: studData } = await supabase
      .from('dm5_students').select('id, nbcamp_user_id').not('nbcamp_user_id', 'is', null);
    const userToSid = new Map((studData ?? []).map(s => [s.nbcamp_user_id as string, s.id as number]));

    let totalTeams = 0, totalMembers = 0;

    for (const [chapterMongoId, teamsMap] of chapters) {
      const chapterCode = mongoToCode.get(chapterMongoId);
      if (!chapterCode) continue;

      // 사라진 팀 삭제 (CASCADE → 팀원도 자동 삭제)
      const { data: existing } = await supabase
        .from('dm5_teams').select('id, mongo_team_id').eq('chapter_code', chapterCode);
      const stale = (existing ?? []).filter(t => !teamsMap.has(t.mongo_team_id as string)).map(t => t.id as number);
      if (stale.length > 0) await supabase.from('dm5_teams').delete().in('id', stale);

      // 팀 upsert
      const teamRecords = Array.from(teamsMap.entries()).map(([mongo_team_id, team]) => ({
        chapter_code: chapterCode,
        mongo_team_id,
        team_num: team.team_num,
        leader_name: team.members.find(m => m.is_leader)?.name ?? null,
        leader_nbcamp_user_id: team.leader_user_id,
        leader_student_id: userToSid.get(team.leader_user_id) ?? null,
      }));

      const { data: upserted, error: tErr } = await supabase
        .from('dm5_teams').upsert(teamRecords, { onConflict: 'mongo_team_id' }).select('id, mongo_team_id');
      if (tErr) throw new Error(tErr.message);
      totalTeams += (upserted ?? []).length;

      const mongoToTeamId = new Map((upserted ?? []).map(t => [t.mongo_team_id as string, t.id as number]));

      // 팀원 재동기화: DELETE → INSERT (추가/제거/변경 모두 처리)
      for (const [mongo_team_id, team] of teamsMap) {
        const teamId = mongoToTeamId.get(mongo_team_id);
        if (!teamId) continue;
        await supabase.from('dm5_team_members').delete().eq('team_id', teamId);
        const memberRecords = team.members.map(m => ({
          team_id: teamId,
          nbcamp_enrolled_id: m.nbcamp_enrolled_id,
          nbcamp_user_id: m.nbcamp_user_id,
          name: m.name,
          is_leader: m.is_leader,
          student_id: userToSid.get(m.nbcamp_user_id) ?? null,
        }));
        const { error: mErr } = await supabase.from('dm5_team_members').insert(memberRecords);
        if (mErr) throw new Error(mErr.message);
        totalMembers += memberRecords.length;
      }
    }

    results.teams = { ok: true, teams: totalTeams, members: totalMembers };
  } catch (e) {
    results.teams = { error: String(e) };
  }

  const hasError = Object.values(results).some(r => (r as Record<string, unknown>).error);
  return NextResponse.json(results, { status: hasError ? 207 : 200 });
}
