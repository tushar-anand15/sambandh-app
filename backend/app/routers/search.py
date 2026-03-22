"""Retrieval-only endpoint — no LLM generation, just embed + search + rerank."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import get_current_user
from ..config import settings
from ..database import get_pool
from ..embedder import embed_query
from ..search import hybrid_search

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10


class SearchSourceOut(BaseModel):
    chunk_id: str
    document_id: str
    excerpt: str
    page: int
    district: str | None = None
    project_no: str | None = None
    lb_name: str | None = None
    lb_type: str | None = None
    chunk_type: str | None = None
    year_label: str | None = None
    score: float = 0.0


class SearchResponse(BaseModel):
    sources: list[SearchSourceOut]
    count: int


@router.post("", response_model=SearchResponse)
async def search(data: SearchRequest, _user: dict = Depends(get_current_user)):
    query_vector = await embed_query(data.query)

    pool = await get_pool()
    async with pool.acquire() as conn:
        results = await hybrid_search(
            conn,
            query_text=data.query,
            query_vector=query_vector,
            top_k=data.top_k,
            rrf_k=settings.rrf_k,
            dense_limit=settings.dense_recall_k,
            fts_limit=settings.fts_recall_k,
            rerank_k=settings.rerank_candidate_k,
            use_rerank=settings.reranker_enabled,
        )

    sources = [
        SearchSourceOut(
            chunk_id=r.chunk_id,
            document_id=r.pdf_id,
            excerpt=r.display_text[:300],
            page=r.page_start,
            district=r.district_name,
            project_no=r.project_no,
            lb_name=r.lb_name,
            lb_type=r.lb_type,
            chunk_type=r.chunk_type,
            year_label=r.year_label,
            score=r.score,
        )
        for r in results
    ]
    return SearchResponse(sources=sources, count=len(sources))
