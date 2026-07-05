import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile

from eduai.config import get_settings
from eduai.ingest import ingest_pdf, seed_sample_textbook
from eduai.milvus_store import store
from eduai.rag import RAGService
from eduai.schemas import ChatCompletionRequest, IngestResult, MaterialLoadRequest


settings = get_settings()
rag_service = RAGService(store, settings)


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.connect()
    if settings.seed_sample_textbook:
        seed_sample_textbook(store)
    yield


app = FastAPI(
    title="EduAI",
    description="K12 AI textbook RAG service with an OpenAI-compatible chat endpoint.",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/options")
def options() -> dict:
    return {
        "grades": [
            "小学一年级",
            "小学二年级",
            "小学三年级",
            "小学四年级",
            "小学五年级",
            "小学六年级",
            "初中",
            "高中",
        ],
        "subjects": ["语文", "数学", "英语"],
    }


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "service": settings.app_name,
        "milvus_collection": settings.collection_name,
        "embedding_model": settings.embedding_model,
    }


@app.post("/materials/upload", response_model=IngestResult)
async def upload_material(
    grade: str = Form(...),
    subject: str = Form(...),
    textbook: str = Form(...),
    file: UploadFile = File(...),
) -> IngestResult:
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="只支持上传 PDF 教材")

    with tempfile.TemporaryDirectory() as tmpdir:
        target = Path(tmpdir) / filename
        with target.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return ingest_pdf(
            path=target,
            grade=grade,
            subject=subject,
            textbook=textbook,
            store=store,
        )


@app.post("/materials/load-sample", response_model=IngestResult)
def load_sample_material(payload: MaterialLoadRequest) -> IngestResult:
    result = seed_sample_textbook(store)
    if result is None:
        return IngestResult(
            material_id="sample-cn-grade3-yuwen",
            grade=payload.grade,
            subject=payload.subject,
            textbook=payload.textbook,
            chunks=0,
        )
    return result


@app.post("/v1/chat/completions")
async def chat_completions(
    payload: ChatCompletionRequest,
    grade: str = Query(..., description="年级，例如：小学三年级"),
    subject: str = Query(..., description="学科，例如：语文"),
) -> dict:
    if payload.stream:
        raise HTTPException(status_code=400, detail="当前版本暂不支持 stream=true")
    messages = [message.model_dump() for message in payload.messages]
    try:
        return await rag_service.answer(
            grade=grade,
            subject=subject,
            messages=messages,
            model=payload.model,
            temperature=payload.temperature,
            max_tokens=payload.max_tokens,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
