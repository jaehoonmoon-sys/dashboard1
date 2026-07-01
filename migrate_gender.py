"""
Excel '팀 편성 참고자료.xlsx' 성별 시트 → Supabase mj_student_profiles.gender 이관
Usage: python migrate_gender.py
"""
import json, urllib.request, urllib.error, os, sys, re
sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "https://wrcpurlzuqhssewojghw.supabase.co")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_zDKVffzmZSlZNdgpFPPV8g_AIEA-Lvy")

EXCEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '팀 편성 참고자료.xlsx')

ALIASES = {'엄시은': '엄채현'}

def norm(n):
    n = re.sub(r'\s*\([^)]*\)', '', str(n)).strip()
    return ALIASES.get(n, n)

def supabase_get(path, params=''):
    url = f"{SUPABASE_URL}/rest/v1/{path}{params}"
    req = urllib.request.Request(url, headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def supabase_patch(path, match_params, data):
    url = f"{SUPABASE_URL}/rest/v1/{path}?{match_params}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method='PATCH', headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def main():
    try:
        import pandas as pd
    except ImportError:
        print('pandas 필요: pip install pandas openpyxl')
        sys.exit(1)

    # 1. Excel에서 성별 데이터 로드
    xl = pd.ExcelFile(EXCEL_PATH)
    df = xl.parse('성별', header=None).iloc[1:]
    df.columns = ['name', 'gender'] + list(df.columns[2:])
    df = df[df['name'].notna() & df['gender'].isin(['남', '여'])].copy()
    df['name'] = df['name'].apply(norm)
    gender_map = dict(zip(df['name'], df['gender']))
    print(f'Excel 성별 데이터: {len(gender_map)}명')

    # 2. Supabase에서 student_id 매핑 조회
    students = supabase_get('mj_students', '?select=id,student_name&order=student_name')
    name_to_id = {s['student_name']: s['id'] for s in students if s['student_name']}
    print(f'Supabase 학생 수: {len(name_to_id)}명')

    # 3. mj_student_profiles 현황 조회
    profiles = supabase_get('mj_student_profiles', '?select=id,student_id,gender')
    sid_to_profile = {p['student_id']: p for p in profiles}

    # 4. 매칭 및 업데이트
    matched = 0
    unmatched = []

    for name, g in gender_map.items():
        student_id = name_to_id.get(name)
        if not student_id:
            unmatched.append(name)
            continue

        profile = sid_to_profile.get(student_id)
        if not profile:
            print(f'  [SKIP] {name}: mj_student_profiles 행 없음 (student_id={student_id})')
            continue

        result = supabase_patch(
            'mj_student_profiles',
            f'student_id=eq.{student_id}',
            {'gender': g}
        )
        if result:
            print(f'  [OK] {name} → {g}')
            matched += 1

    print(f'\n완료: {matched}명 업데이트')
    if unmatched:
        print(f'매칭 실패 ({len(unmatched)}명): {unmatched}')

if __name__ == '__main__':
    main()
