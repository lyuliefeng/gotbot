import time

import httpx
from langchain_core.prompts import ChatPromptTemplate

from eduai.config import Settings, get_settings
from eduai.milvus_store import MilvusTextbookStore
from eduai.schemas import Citation, RetrievedChunk


SYSTEM_PROMPT = """你是 EduAI，一个面向 K12 学生的教材问答助手。
你必须基于给定教材片段回答，不要编造教材中没有的内容。
回答要符合学生年级的理解水平，语言清楚、步骤短、例子简单。
如果教材片段不足以回答，要明确说明“当前教材片段不足以回答”。
回答末尾必须列出引用来源，格式为：引用来源：教材名 / 章节名 / 页码。
"""

PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        (
            "user",
            "学生年级：{grade}\n学科：{subject}\n\n教材片段：\n{context}\n\n学生问题：{question}",
        ),
    ]
)


def latest_user_question(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            return str(message.get("content") or "").strip()
    return ""


def citations_for_chunks(chunks: list[RetrievedChunk]) -> list[Citation]:
    seen: set[tuple[str, str, int | None]] = set()
    citations: list[Citation] = []
    for chunk in chunks:
        key = (chunk.textbook, chunk.chapter, chunk.page)
        if key in seen:
            continue
        seen.add(key)
        citations.append(
            Citation(
                textbook=chunk.textbook,
                chapter=chunk.chapter,
                page=chunk.page,
                chunk_id=chunk.chunk_id,
            )
        )
    return citations


def format_context(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "未检索到相关教材片段。"
    lines = []
    for index, chunk in enumerate(chunks, start=1):
        page = f"第 {chunk.page} 页" if chunk.page else "页码未知"
        lines.append(
            f"[{index}] 教材：{chunk.textbook}；章节：{chunk.chapter}；{page}\n{chunk.text}"
        )
    return "\n\n".join(lines)


def format_citation_block(citations: list[Citation]) -> str:
    if not citations:
        return "引用来源：未检索到教材来源"
    parts = []
    for citation in citations:
        page = f"第 {citation.page} 页" if citation.page else "页码未知"
        parts.append(f"{citation.textbook} / {citation.chapter} / {page}")
    return "引用来源：" + "；".join(parts)


def fallback_answer(grade: str, subject: str, question: str, chunks: list[RetrievedChunk]) -> str:
    citations = citations_for_chunks(chunks)
    if not chunks:
        return (
            f"当前没有检索到 {grade}{subject} 的相关教材内容，所以不能可靠回答这个问题。\n\n"
            "请先上传或加载对应教材 PDF，再重新提问。\n\n"
            f"{format_citation_block(citations)}"
        )
    first = chunks[0].text.strip().replace("\n", "")
    excerpt = first[:220]
    return (
        f"我先按{grade}学生能理解的话来说。\n\n"
        f"你问的是：{question}\n\n"
        f"教材里相关内容是：{excerpt}\n\n"
        "可以这样理解：先找到题目或课文里的关键词，再对照教材中的方法一步一步回答。"
        "如果是写作题，要先说清楚主要事物，再补充颜色、形状、声音或动作等细节。\n\n"
        f"{format_citation_block(citations)}"
    )


async def call_openai_compatible(
    *,
    settings: Settings,
    model: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
) -> str:
    if not settings.llm_api_key:
        raise RuntimeError("LLM_API_KEY is not configured")
    base = (settings.llm_api_base or "https://api.openai.com").rstrip("/")
    url = f"{base}/v1/chat/completions"
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {settings.llm_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        response.raise_for_status()
        payload = response.json()
    return payload["choices"][0]["message"]["content"]


class RAGService:
    def __init__(self, store: MilvusTextbookStore, settings: Settings | None = None):
        self.store = store
        self.settings = settings or get_settings()

    async def answer(
        self,
        *,
        grade: str,
        subject: str,
        messages: list[dict],
        model: str | None,
        temperature: float | None,
        max_tokens: int | None,
    ) -> dict:
        question = latest_user_question(messages)
        if not question:
            raise ValueError("messages 中必须包含 user 问题")
        chunks = self.store.search(question, grade=grade, subject=subject, limit=5)
        citations = citations_for_chunks(chunks)
        prompt_value = PROMPT.invoke(
            {
                "grade": grade,
                "subject": subject,
                "context": format_context(chunks),
                "question": question,
            }
        )
        role_map = {"system": "system", "human": "user", "ai": "assistant"}
        llm_messages = [
            {"role": role_map.get(item.type, "user"), "content": item.content}
            for item in prompt_value.messages
        ]
        selected_model = model or self.settings.llm_model
        try:
            content = await call_openai_compatible(
                settings=self.settings,
                model=selected_model,
                messages=llm_messages,
                temperature=temperature if temperature is not None else 0.2,
                max_tokens=max_tokens or 800,
            )
            if "引用来源：" not in content:
                content = f"{content.rstrip()}\n\n{format_citation_block(citations)}"
        except Exception:
            content = fallback_answer(grade, subject, question, chunks)

        return {
            "id": f"chatcmpl-eduai-{int(time.time() * 1000)}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": selected_model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop",
                }
            ],
            "citations": [citation.model_dump() for citation in citations],
        }
