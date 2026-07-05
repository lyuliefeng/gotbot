#!/usr/bin/env python3
import ast
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def assert_contains(path: str, text: str) -> None:
    source = read(path)
    assert text in source, f"{path} must contain {text!r}"


def main() -> None:
    compose = yaml.safe_load(read("docker-compose.yml"))
    services = compose["services"]
    for service in ["etcd", "minio", "milvus", "api"]:
        assert service in services, f"docker-compose.yml must define {service}"
    assert services["milvus"]["image"].startswith("milvusdb/milvus"), "compose must include Milvus"
    assert services["api"]["ports"] == ["8080:8080"], "api must expose localhost:8080"
    assert "healthcheck" in services["api"], "api service must define a healthcheck"
    env = services["api"]["environment"]
    assert env["EMBEDDING_MODEL"] == "BAAI/bge-small-zh-v1.5"
    assert "LLM_API_BASE" in env and "LLM_API_KEY" in env

    dockerfile = read("Dockerfile")
    assert "FROM python:3.11-slim" in dockerfile
    assert 'CMD ["uvicorn", "eduai.api:app"' in dockerfile

    requirements = read("requirements.txt")
    for dep in ["fastapi", "pymilvus", "sentence-transformers", "langchain", "langchain-text-splitters"]:
        assert dep in requirements, f"requirements.txt must include {dep}"

    for path in sorted((ROOT / "eduai").glob("*.py")):
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

    assert_contains("eduai/api.py", '@app.get("/options")')
    assert_contains("eduai/api.py", '@app.post("/materials/upload"')
    assert_contains("eduai/api.py", '@app.post("/v1/chat/completions")')
    assert_contains("eduai/ingest.py", "PdfReader")
    assert_contains("eduai/ingest.py", "embed_texts")
    assert_contains("eduai/milvus_store.py", "CollectionSchema")
    assert_contains("eduai/rag.py", "LLM_API_KEY")
    assert_contains("eduai/rag.py", "引用来源：")
    assert "LLM_API_KEY=" in read(".env.example")
    assert_contains("scripts/verify_eduai_dod.sh", "docker compose up -d --build")
    assert_contains("scripts/verify_eduai_dod.sh", "http://localhost:8080/docs")
    assert_contains("scripts/verify_eduai_dod.sh", "/v1/chat/completions?grade=小学三年级&subject=语文")

    forbidden_patterns = ["sk-", "Bearer sk-"]
    combined = "\n".join(
        read(path)
        for path in [
            "docker-compose.yml",
            "Dockerfile",
            "requirements.txt",
            ".env.example",
            "eduai/config.py",
            "eduai/rag.py",
            "EDUAI.md",
        ]
    )
    for pattern in forbidden_patterns:
        assert pattern not in combined, f"hard-coded API key-like pattern found: {pattern}"

    print("EduAI static objective checks passed.")


if __name__ == "__main__":
    main()
