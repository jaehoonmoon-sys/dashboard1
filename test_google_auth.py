"""Google Service Account 인증 테스트"""
import os, sys, json, time, base64, urllib.request, urllib.parse
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path

def load_env():
    env_file = Path(__file__).parent / ".env.local"
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

load_env()

email = os.environ["GOOGLE_CLIENT_EMAIL"]
raw_key = os.environ["GOOGLE_PRIVATE_KEY"]

# \n 리터럴을 실제 개행으로 변환
private_key_pem = raw_key.replace("\\n", "\n")

print("=== 상태 확인 ===")
print(f"email: {email}")
print(f"PEM 시작: {private_key_pem[:30]!r}")
print(f"PEM 끝:   {private_key_pem[-30:]!r}")
print()

from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend

pk = serialization.load_pem_private_key(
    private_key_pem.encode(), password=None, backend=default_backend()
)
print("PEM 로드 성공")

now = int(time.time())
header = base64.urlsafe_b64encode(
    json.dumps({"alg": "RS256", "typ": "JWT"}).encode()
).rstrip(b"=")
claim = base64.urlsafe_b64encode(json.dumps({
    "iss": email,
    "scope": "https://www.googleapis.com/auth/spreadsheets.readonly",
    "aud": "https://oauth2.googleapis.com/token",
    "exp": now + 3600,
    "iat": now,
}).encode()).rstrip(b"=")

msg = header + b"." + claim
sig = base64.urlsafe_b64encode(
    pk.sign(msg, padding.PKCS1v15(), hashes.SHA256())
).rstrip(b"=")
jwt = (msg + b"." + sig).decode()

data = urllib.parse.urlencode({
    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
    "assertion": jwt,
}).encode()

req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data)
with urllib.request.urlopen(req, timeout=10) as r:
    resp = json.load(r)

if "access_token" in resp:
    print("구글 인증 성공!")
    print(f"token_type: {resp.get('token_type')}")
    print(f"expires_in: {resp.get('expires_in')}초")
else:
    print("실패:", resp)
