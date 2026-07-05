#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found; cannot run EduAI DoD verification" >&2
  exit 127
fi

cleanup() {
  if [[ "${EDUAI_KEEP_CONTAINERS:-}" != "1" ]]; then
    docker compose down >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker compose up -d --build

python3 - <<'PY'
import json
import time
import urllib.error
import urllib.request


def request(method: str, url: str, body: dict | None = None, timeout: int = 20):
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read()
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            return json.loads(raw.decode("utf-8"))
        return raw.decode("utf-8", errors="replace")


deadline = time.time() + 300
last_error = None
while time.time() < deadline:
    try:
        health = request("GET", "http://localhost:8080/health", timeout=5)
        if health.get("ok") is True:
            break
    except Exception as exc:
        last_error = exc
        time.sleep(5)
else:
    raise SystemExit(f"EduAI API did not become healthy: {last_error}")

docs = request("GET", "http://localhost:8080/docs", timeout=10)
assert "Swagger UI" in docs or "openapi" in docs.lower(), "/docs did not return API documentation HTML"

payload = {
    "model": "eduai-textbook",
    "messages": [
        {"role": "user", "content": "写景作文应该怎么观察？"}
    ],
}
chat = request(
    "POST",
    "http://localhost:8080/v1/chat/completions?grade=小学三年级&subject=语文",
    body=payload,
    timeout=60,
)
content = chat["choices"][0]["message"]["content"]
assert "引用来源：" in content, "chat answer must include 引用来源"
assert "章节" in content or chat.get("citations"), "answer must include chapter/page citations"
assert chat.get("citations"), "response must include top-level citations"
assert any(citation.get("chapter") and citation.get("page") for citation in chat["citations"]), "citations must include chapter and page"

print("EduAI DoD verification passed.")
print(content)
PY
