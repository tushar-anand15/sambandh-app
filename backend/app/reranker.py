"""
Cross-encoder reranker using Jina Reranker v2 (multilingual).

Loaded lazily on first use. Falls back gracefully if sentence-transformers
is not installed or the model fails to load.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from .config import settings

logger = logging.getLogger(__name__)

_reranker = None
_available = True

try:
    from sentence_transformers import CrossEncoder
except ImportError:
    _available = False
    CrossEncoder = None  # type: ignore[assignment,misc]
    logger.warning("sentence-transformers not installed — reranker disabled")


def get_reranker():
    global _reranker
    if not _available or not settings.reranker_enabled:
        return None
    if _reranker is None:
        logger.info("Loading reranker model: %s", settings.reranker_model)
        _reranker = CrossEncoder(
            settings.reranker_model,
            automodel_args={"torch_dtype": "auto"},
            trust_remote_code=True,
        )
        logger.info("Reranker loaded")
    return _reranker


def _rerank_sync(
    query: str, passages: list[str]
) -> list[float]:
    model = get_reranker()
    if model is None:
        return []
    pairs = [(query, p) for p in passages]
    scores = model.predict(pairs)
    return [float(s) for s in scores]


async def rerank_chunks(
    query: str,
    candidates: list[dict[str, Any]],
    top_k: int = 10,
) -> list[dict[str, Any]]:
    """Rerank candidate chunks and return the top_k by relevance score."""
    if not _available or not settings.reranker_enabled or not candidates:
        return candidates[:top_k]

    passages = [c["display_text"] for c in candidates]
    loop = asyncio.get_running_loop()
    scores = await loop.run_in_executor(None, _rerank_sync, query, passages)

    if not scores:
        return candidates[:top_k]

    ranked = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)
    for chunk, score in ranked[:top_k]:
        chunk["rerank_score"] = score
    return [c for c, _ in ranked[:top_k]]
