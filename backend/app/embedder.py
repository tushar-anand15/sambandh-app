"""
Query-time embedding using BGE-M3.

Loads the model on first use and caches it. Produces 1024-dim dense
vectors compatible with the preprocessing pipeline's chunk_embeddings.

Falls back gracefully if FlagEmbedding is not installed.
"""

from __future__ import annotations

import asyncio
import logging

from .config import settings

logger = logging.getLogger(__name__)
_model = None
_flag_available = True

try:
    from FlagEmbedding import BGEM3FlagModel
except ImportError:
    _flag_available = False
    BGEM3FlagModel = None
    logger.warning("FlagEmbedding not installed — dense search disabled")


def _get_model():
    global _model
    if not _flag_available:
        return None
    if _model is None:
        _model = BGEM3FlagModel(settings.embed_model, use_fp16=False)
    return _model


async def embed_query(text: str) -> list[float]:
    if not _flag_available:
        return [0.0] * settings.embed_dim
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _embed_sync, text)


def _embed_sync(text: str) -> list[float]:
    model = _get_model()
    if model is None:
        return [0.0] * settings.embed_dim
    output = model.encode(
        [text],
        return_dense=True,
        return_sparse=False,
        return_colbert_vecs=False,
    )
    return output["dense_vecs"][0].tolist()
