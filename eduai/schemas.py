from typing import Any, Literal

from pydantic import BaseModel, Field


class Citation(BaseModel):
    textbook: str
    chapter: str
    page: int | None = None
    chunk_id: str


class RetrievedChunk(BaseModel):
    chunk_id: str
    text: str
    score: float
    grade: str
    subject: str
    textbook: str
    chapter: str
    page: int | None = None


class IngestResult(BaseModel):
    material_id: str
    grade: str
    subject: str
    textbook: str
    chunks: int


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatCompletionRequest(BaseModel):
    model: str | None = None
    messages: list[ChatMessage]
    temperature: float | None = 0.2
    stream: bool | None = False
    max_tokens: int | None = Field(default=800, ge=1)
    metadata: dict[str, Any] | None = None


class MaterialLoadRequest(BaseModel):
    grade: str = "小学三年级"
    subject: str = "语文"
    textbook: str = "小学三年级语文示例教材"
