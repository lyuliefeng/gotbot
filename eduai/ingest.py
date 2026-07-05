import re
import uuid
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

from eduai.embeddings import embed_texts
from eduai.milvus_store import MilvusTextbookStore
from eduai.schemas import IngestResult


CHAPTER_RE = re.compile(r"(第[一二三四五六七八九十百\d]+[章节单元][^\n]{0,40})")
PAGE_RE = re.compile(r"页码[:：]\s*(\d+)")


splitter = RecursiveCharacterTextSplitter(
    chunk_size=520,
    chunk_overlap=80,
    separators=["\n\n", "\n", "。", "！", "？", "；", "，", " "],
)


def _stable_material_id(grade: str, subject: str, textbook: str) -> str:
    source = f"{grade}:{subject}:{textbook}"
    return uuid.uuid5(uuid.NAMESPACE_URL, source).hex


def _chapter_for_text(text: str, fallback: str) -> str:
    match = CHAPTER_RE.search(text)
    return match.group(1).strip() if match else fallback


def _page_for_text(text: str, fallback: int) -> int:
    match = PAGE_RE.search(text)
    return int(match.group(1)) if match else fallback


def _rows_from_pages(
    *,
    pages: list[tuple[int, str]],
    grade: str,
    subject: str,
    textbook: str,
    material_id: str,
) -> list[dict]:
    rows: list[dict] = []
    sequence = 0
    for page, page_text in pages:
        page_text = page_text.strip()
        if not page_text:
            continue
        chapter = _chapter_for_text(page_text, "未识别章节")
        chunks = splitter.split_text(page_text)
        vectors = embed_texts(chunks)
        for chunk, vector in zip(chunks, vectors, strict=True):
            sequence += 1
            rows.append(
                {
                    "id": f"{material_id}-{sequence:05d}",
                    "material_id": material_id,
                    "grade": grade,
                    "subject": subject,
                    "textbook": textbook,
                    "chapter": _chapter_for_text(chunk, chapter),
                    "page": _page_for_text(chunk, page),
                    "text": chunk[:8000],
                    "vector": vector,
                }
            )
    return rows


def ingest_pdf(
    *,
    path: Path,
    grade: str,
    subject: str,
    textbook: str,
    store: MilvusTextbookStore,
    material_id: str | None = None,
) -> IngestResult:
    reader = PdfReader(str(path))
    pages = [(index + 1, page.extract_text() or "") for index, page in enumerate(reader.pages)]
    return ingest_pages(
        pages=pages,
        grade=grade,
        subject=subject,
        textbook=textbook,
        store=store,
        material_id=material_id,
    )


def ingest_textbook_text(
    *,
    path: Path,
    grade: str,
    subject: str,
    textbook: str,
    store: MilvusTextbookStore,
    material_id: str | None = None,
) -> IngestResult:
    text = path.read_text(encoding="utf-8")
    pages = []
    current_page = 1
    sections = re.split(r"(?=页码[:：]\s*\d+)", text)
    for section in sections:
        if not section.strip():
            continue
        current_page = _page_for_text(section, current_page)
        pages.append((current_page, section))
    return ingest_pages(
        pages=pages,
        grade=grade,
        subject=subject,
        textbook=textbook,
        store=store,
        material_id=material_id,
    )


def ingest_pages(
    *,
    pages: list[tuple[int, str]],
    grade: str,
    subject: str,
    textbook: str,
    store: MilvusTextbookStore,
    material_id: str | None = None,
) -> IngestResult:
    material_id = material_id or _stable_material_id(grade, subject, textbook)
    rows = _rows_from_pages(
        pages=pages,
        grade=grade,
        subject=subject,
        textbook=textbook,
        material_id=material_id,
    )
    store.delete_material(material_id)
    count = store.insert_chunks(rows)
    return IngestResult(
        material_id=material_id,
        grade=grade,
        subject=subject,
        textbook=textbook,
        chunks=count,
    )


def seed_sample_textbook(store: MilvusTextbookStore) -> IngestResult | None:
    material_id = "sample-cn-grade3-yuwen"
    if store.has_material(material_id):
        return None
    sample_path = Path("data/sample_textbooks/grade3_yuwen.txt")
    return ingest_textbook_text(
        path=sample_path,
        grade="小学三年级",
        subject="语文",
        textbook="小学三年级语文示例教材",
        store=store,
        material_id=material_id,
    )
