from fastapi import APIRouter, Depends

from ..auth import get_current_user
from ..config import settings
from ..database import get_pool
from ..embedder import embed_query
from ..models import ChatRequest, ChatResponse
from ..search import hybrid_search

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(data: ChatRequest, _current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        query_vector = await embed_query(data.message)

        results = await hybrid_search(
            conn,
            query_text=data.message,
            query_vector=query_vector,
            top_k=settings.search_top_k,
            rrf_k=settings.rrf_k,
            dense_limit=settings.dense_recall_k,
            fts_limit=settings.fts_recall_k,
        )

        context_parts = []
        sources = []
        for r in results:
            context_parts.append(
                f"[{r.chunk_type}] (pages {r.page_start}-{r.page_end})\n"
                f"{r.display_text}"
            )
            sources.append({
                "chunk_id": r.chunk_id,
                "document_id": r.pdf_id,
                "excerpt": r.display_text[:200],
                "page": r.page_start,
                "district": r.district_name,
                "project_no": r.project_no,
            })

        context = "\n\n---\n\n".join(context_parts)
        response_text = await _generate_response(data.message, context)

    return ChatResponse(response=response_text, sources=sources)


async def _generate_response(query: str, context: str) -> str:
    if not settings.llm_api_key:
        return (
            "RAG search completed. Found relevant chunks but LLM is not "
            "configured. Set LLM_API_KEY and LLM_MODEL in your .env to "
            "enable answer generation."
        )

    # TODO: Wire up actual LLM provider (OpenAI, Anthropic, Gemini, etc.)
    return f"LLM integration pending. Prompt built with {len(context)} chars of context."
