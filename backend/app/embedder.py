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


def embeddings_available() -> bool:
    """Whether a query can be embedded at all.

    False in the deployed image, which does not install the `embedding` extra:
    bge-m3 and the reranker want torch, and the production VM has no GPU and
    2 GB of memory to serve a site with. Search there is the FTS arm only.
    """
    return _flag_available


async def embed_query(text: str) -> list[float] | None:
    """The query's dense vector, or None when there is no model to produce one.

    None rather than a zero vector, and the distinction is the whole point.
    A zero vector is a perfectly valid input to pgvector: cosine distance
    against it is undefined-but-computed, every row ties, and the ANN index
    returns fifty rows in whatever order it happened to walk. That ordering
    then went into `rrf_fuse` alongside the FTS ranking and was weighted
    exactly the same as it, so half of every result set the assistant produced
    was noise wearing the shape of a ranking. It could not fail loudly, because
    there is no error anywhere in that path — just worse answers.

    Returning None makes the absence a thing the caller has to handle, and
    `hybrid_search` handles it by not running the dense arm.
    """
    if not _flag_available:
        return None
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _embed_sync, text)


def _embed_sync(text: str) -> list[float] | None:
    model = _get_model()
    if model is None:
        return None
    output = model.encode(
        [text],
        return_dense=True,
        return_sparse=False,
        return_colbert_vecs=False,
    )
    return output["dense_vecs"][0].tolist()
