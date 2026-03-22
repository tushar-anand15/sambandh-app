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
    query_vector = await embed_query(data.message)

    pool = await get_pool()
    async with pool.acquire() as conn:
        results = await hybrid_search(
            conn,
            query_text=data.message,
            query_vector=query_vector,
            top_k=settings.search_top_k,
            rrf_k=settings.rrf_k,
            dense_limit=settings.dense_recall_k,
            fts_limit=settings.fts_recall_k,
            rerank_k=settings.rerank_candidate_k,
            use_rerank=settings.reranker_enabled,
        )

    sources = []
    context_parts = []
    for r in results:
        context_parts.append(
            f"[{r.chunk_type}] (pages {r.page_start}-{r.page_end}) "
            f"[{r.lb_name or ''} / Project {r.project_no or 'N/A'}]\n"
            f"{r.display_text}"
        )
        sources.append({
            "chunk_id": r.chunk_id,
            "document_id": r.pdf_id,
            "excerpt": r.display_text[:200],
            "page": r.page_start,
            "district": r.district_name,
            "project_no": r.project_no,
            "lb_name": r.lb_name,
            "score": r.score,
        })

    context = "\n\n---\n\n".join(context_parts)
    response_text = await _generate_response(data.message, context)

    return ChatResponse(response=response_text, sources=sources)


async def _generate_response(query: str, context: str) -> str:
    """Generate a response using LiteLLM. Falls back to context summary if not configured."""
    if not settings.llm_api_key:
        if context:
            return (
                f"Found {context.count('---') + 1} relevant document chunks. "
                "LLM is not configured — set LLM_API_KEY in .env to enable "
                "answer generation.\n\n"
                "**Top result preview:**\n\n"
                + context[:500]
            )
        return "No relevant documents found for your query."

    try:
        import litellm
        response = await litellm.acompletion(
            model=settings.llm_provider,
            messages=[
                {"role": "system", "content": (
                    "You are GramSAMBANDH, an AI assistant for Kerala's local government "
                    "project records. Answer based ONLY on the provided context. "
                    "Cite sources with project numbers and local body names. "
                    "If the context doesn't contain the answer, say so clearly."
                )},
                {"role": "user", "content": (
                    f"Context from retrieved documents:\n\n{context}\n\n"
                    f"Question: {query}"
                )},
            ],
            api_key=settings.llm_api_key,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error generating response: {e}. Retrieved {context.count('---') + 1} relevant chunks."
