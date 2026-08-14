"""
Query embedding, against the same model that embedded the corpus.

`chunk_embeddings` holds 99,616 vectors produced by `gemini-embedding-001` at
1024 dimensions. Confirmed against the data rather than the config: embedding a
chunk's exact text with that model scores 0.96 cosine against its stored vector,
where a different model would score near zero.

This file used to load BGE-M3 locally, which was wrong in a way that could not
fail loudly. A dense vector from a different model is not a worse query, it is a
meaningless one: the two models put unrelated meanings at the same coordinates,
so the nearest neighbours come back arbitrary. It looked like search, and it
never was. Torch was never installed in production either, so what actually
shipped was `embed_query` returning a zero vector, every row in pgvector scoring
NaN against it, and fifty arbitrary chunks being fused into the results at full
weight.

Calling the API rather than running a model is what makes the small machine
possible. There is no torch in the image, no 2 GB of weights to download, and
nothing to hold in the memory of a 4 GB VM that is also running Postgres. It is
one HTTPS request per question.

Auth is the VM's own service account through ADC, the same path `app/agent.py`
already uses for the chat model, so this adds no credential and no secret.
"""

from __future__ import annotations

import logging

from .config import settings

logger = logging.getLogger(__name__)

# Matched to the corpus by measurement, not by what the textbook advises.
#
# The usual arrangement is asymmetric -- passages as RETRIEVAL_DOCUMENT,
# questions as RETRIEVAL_QUERY -- but the corpus here was embedded with the
# API's default, which is RETRIEVAL_QUERY. Re-embedding a stored chunk's exact
# text scores 1.0000 cosine against its row with this task type and 0.9644 with
# RETRIEVAL_DOCUMENT, so the default is what produced the table.
#
# Symmetric embedding is slightly weaker than the asymmetric pairing, but it is
# what these 99,616 vectors are, and matching them beats being theoretically
# right against a corpus that disagrees. Changing this means re-embedding.
QUERY_TASK_TYPE = "RETRIEVAL_QUERY"


def embeddings_available() -> bool:
    """Whether a query can be embedded.

    True whenever an embedding model is configured. Unlike the local-model
    version this cannot be answered at import time -- the call can still fail on
    a network error or a revoked credential -- so `embed_query` returning None
    remains the thing callers must handle.
    """
    return bool(settings.embed_model)


async def embed_query(text: str) -> list[float] | None:
    """The query's dense vector, or None if it could not be produced.

    None rather than a zero vector, and the distinction matters: a zero vector
    is a valid input that pgvector scores as NaN against every row, so the
    "failure" is fifty arbitrary chunks ranked as confidently as real matches.
    `hybrid_search` handles None by not running the dense arm at all, which
    leaves full-text search answering on its own -- a narrower result set, and
    an honest one.
    """
    if not embeddings_available():
        return None

    # Imported here, not at module scope. litellm pulls in a large dependency
    # tree and the public read endpoints -- which are most of this site -- never
    # embed anything.
    from litellm import aembedding

    try:
        response = await aembedding(
            model=settings.embed_model,
            input=[text],
            # Must match the stored vectors. gemini-embedding-001 defaults to
            # 3072 and is Matryoshka-truncatable; the corpus is 1024, and a
            # dimension mismatch is an error from pgvector rather than a bad
            # result, which is the good outcome.
            dimensions=settings.embed_dim,
            task_type=QUERY_TASK_TYPE,
        )
        vector = response.data[0]["embedding"]
    except Exception as exc:
        # Not fatal. The assistant still answers from full-text search, so a
        # transient embedding failure degrades the results rather than the
        # request. Logged at warning because a *persistent* failure here is
        # invisible from the outside: answers simply get worse.
        logger.warning("Query embedding failed, falling back to full-text only: %s", exc)
        return None

    if len(vector) != settings.embed_dim:
        logger.warning(
            "Query embedding has %d dimensions, corpus has %d -- not using it",
            len(vector),
            settings.embed_dim,
        )
        return None

    return list(vector)
