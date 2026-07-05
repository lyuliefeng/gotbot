# EduAI

EduAI is a Python 3.11 FastAPI service for K12 textbook RAG.

## Start

```bash
cp .env.example .env
# Fill LLM_API_BASE and LLM_API_KEY when you want real model calls.
docker compose up
```

API docs are available at:

```text
http://localhost:8080/docs
```

The service seeds a small `小学三年级 / 语文` sample textbook on startup so the chat endpoint can be tested before uploading a PDF.

Grade and subject options are available at:

```text
GET http://localhost:8080/options
```

## Upload A PDF Textbook

```bash
curl -X POST 'http://localhost:8080/materials/upload' \
  -F 'grade=小学三年级' \
  -F 'subject=语文' \
  -F 'textbook=小学三年级语文上册' \
  -F 'file=@/path/to/textbook.pdf'
```

## OpenAI-Compatible Chat

```bash
curl -X POST 'http://localhost:8080/v1/chat/completions?grade=小学三年级&subject=语文' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "eduai-textbook",
    "messages": [
      {"role": "user", "content": "写景作文应该怎么观察？"}
    ]
  }'
```

Answers include a `引用来源` block and a top-level `citations` array.

## Static Verification

When Docker is not available, run the static objective checker:

```bash
python3 scripts/verify_eduai_static.py
```
