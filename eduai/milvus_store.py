import time
from collections.abc import Iterable

from pymilvus import Collection, CollectionSchema, DataType, FieldSchema, connections, utility

from eduai.config import Settings, get_settings
from eduai.embeddings import embed_query
from eduai.schemas import RetrievedChunk


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


class MilvusTextbookStore:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.collection: Collection | None = None

    def connect(self, timeout_seconds: int = 120) -> None:
        deadline = time.time() + timeout_seconds
        last_error: Exception | None = None
        while time.time() < deadline:
            try:
                connections.connect(
                    alias="default",
                    host=self.settings.milvus_host,
                    port=str(self.settings.milvus_port),
                )
                self.collection = self._ensure_collection()
                self.collection.load()
                return
            except Exception as exc:  # pragma: no cover - depends on container startup timing
                last_error = exc
                time.sleep(2)
        raise RuntimeError(f"Milvus is not ready: {last_error}") from last_error

    def _ensure_collection(self) -> Collection:
        name = self.settings.collection_name
        if utility.has_collection(name):
            return Collection(name)

        fields = [
            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=128),
            FieldSchema(name="material_id", dtype=DataType.VARCHAR, max_length=128),
            FieldSchema(name="grade", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="subject", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="textbook", dtype=DataType.VARCHAR, max_length=256),
            FieldSchema(name="chapter", dtype=DataType.VARCHAR, max_length=256),
            FieldSchema(name="page", dtype=DataType.INT64),
            FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=8192),
            FieldSchema(name="vector", dtype=DataType.FLOAT_VECTOR, dim=self.settings.embedding_dim),
        ]
        schema = CollectionSchema(fields=fields, description="EduAI textbook chunks")
        collection = Collection(name=name, schema=schema)
        collection.create_index(
            field_name="vector",
            index_params={
                "metric_type": "IP",
                "index_type": "AUTOINDEX",
                "params": {},
            },
        )
        return collection

    def _get_collection(self) -> Collection:
        if self.collection is None:
            self.connect()
        assert self.collection is not None
        return self.collection

    def has_material(self, material_id: str) -> bool:
        collection = self._get_collection()
        expr = f'material_id == "{_escape(material_id)}"'
        result = collection.query(expr=expr, output_fields=["id"], limit=1)
        return bool(result)

    def delete_material(self, material_id: str) -> None:
        collection = self._get_collection()
        expr = f'material_id == "{_escape(material_id)}"'
        collection.delete(expr)
        collection.flush()

    def insert_chunks(self, rows: Iterable[dict]) -> int:
        rows = list(rows)
        if not rows:
            return 0
        collection = self._get_collection()
        collection.insert(
            [
                [row["id"] for row in rows],
                [row["material_id"] for row in rows],
                [row["grade"] for row in rows],
                [row["subject"] for row in rows],
                [row["textbook"] for row in rows],
                [row["chapter"] for row in rows],
                [row["page"] for row in rows],
                [row["text"] for row in rows],
                [row["vector"] for row in rows],
            ]
        )
        collection.flush()
        collection.load()
        return len(rows)

    def search(self, query: str, grade: str, subject: str, limit: int = 5) -> list[RetrievedChunk]:
        collection = self._get_collection()
        vector = embed_query(query)
        expr = f'grade == "{_escape(grade)}" && subject == "{_escape(subject)}"'
        results = collection.search(
            data=[vector],
            anns_field="vector",
            param={"metric_type": "IP", "params": {}},
            limit=limit,
            expr=expr,
            output_fields=["id", "text", "grade", "subject", "textbook", "chapter", "page"],
        )
        chunks: list[RetrievedChunk] = []
        for hit in results[0]:
            entity = hit.entity
            chunks.append(
                RetrievedChunk(
                    chunk_id=entity.get("id"),
                    text=entity.get("text"),
                    score=float(hit.distance),
                    grade=entity.get("grade"),
                    subject=entity.get("subject"),
                    textbook=entity.get("textbook"),
                    chapter=entity.get("chapter"),
                    page=entity.get("page"),
                )
            )
        return chunks


store = MilvusTextbookStore()
