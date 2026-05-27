"""구글 시트 읽기 테스트"""
import os, sys, json, time, base64, urllib.request, urllib.parse
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path

SHEET_ID = "1lEUpndQWSOP0sE9zcWRWFMOmOIo_LGskFOPrFt56sQI"
GID = "885843313"

def load_env():
    env_file = Path(__file__).parent / ".env.local"
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

def get_access_token(email, private_key_pem):
    from cryptography.hazmat.primitives import serialization, hashes
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.backends import default_backend

    pk = serialization.load_pem_private_key(
        private_key_pem.encode(), password=None, backend=default_backend()
    )
    now = int(time.time())
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).rstrip(b"=")
    claim = base64.urlsafe_b64encode(json.dumps({
        "iss": email,
        "scope": "https://www.googleapis.com/auth/spreadsheets.readonly",
        "aud": "https://oauth2.googleapis.com/token",
        "exp": now + 3600,
        "iat": now,
    }).encode()).rstrip(b"=")
    msg = header + b"." + claim
    sig = base64.urlsafe_b64encode(pk.sign(msg, padding.PKCS1v15(), hashes.SHA256())).rstrip(b"=")
    jwt = (msg + b"." + sig).decode()

    data = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt,
    }).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)["access_token"]

load_env()
email = os.environ["GOOGLE_CLIENT_EMAIL"]
private_key_pem = os.environ["GOOGLE_PRIVATE_KEY"].replace("\\n", "\n")

print("인증 중...")
token = get_access_token(email, private_key_pem)
print("인증 완료\n")

# GID로 탭 이름 조회
meta_url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}?fields=sheets.properties"
req = urllib.request.Request(meta_url, headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req, timeout=10) as r:
    meta = json.load(r)

sheet_name = None
for s in meta["sheets"]:
    if s["properties"]["sheetId"] == int(GID):
        sheet_name = s["properties"]["title"]
        break

print(f"탭 이름: {sheet_name}\n")

# 시트 데이터 읽기 (첫 5행만)
range_str = urllib.parse.quote(f"{sheet_name}!A1:Z5")
url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{range_str}"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req, timeout=10) as r:
    data = json.load(r)

rows = data.get("values", [])
print(f"읽어온 행 수: {len(rows)}\n")
for i, row in enumerate(rows):
    print(f"  {i+1}행: {row}")
