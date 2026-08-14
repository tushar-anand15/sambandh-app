"""
Hybrid search: pgvector dense ANN + Postgres FTS + RRF fusion + optional rerank.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field

import asyncpg

from .reranker import rerank_chunks


@dataclass
class SearchResult:
    chunk_id: str
    pdf_id: str
    chunk_type: str
    section_path: list[str]
    display_text: str
    search_text: str
    page_start: int
    page_end: int
    metadata: dict
    district_name: str | None
    lb_name: str | None
    lb_type: str | None
    project_no: str | None
    year_label: str | None
    score: float
    project_name: str | None = None


async def dense_recall(
    conn: asyncpg.Connection,
    query_vector: list[float],
    *,
    limit: int = 50,
    district: str | None = None,
    lb_type: str | None = None,
    year: str | None = None,
) -> list[tuple[str, int]]:
    rows = await conn.fetch(
        """
        SELECT pc.chunk_id
        FROM chunk_embeddings ce
        JOIN processed_chunks pc ON pc.chunk_id = ce.chunk_id
        WHERE ($2::text IS NULL OR pc.district_name = $2)
          AND ($3::text IS NULL OR pc.lb_type = $3)
          AND ($4::text IS NULL OR pc.year_label = $4)
        ORDER BY ce.embedding <=> $1::vector
        LIMIT $5
        """,
        str(query_vector),
        district,
        lb_type,
        year,
        limit,
    )
    return [(str(r["chunk_id"]), rank) for rank, r in enumerate(rows)]


async def fts_recall(
    conn: asyncpg.Connection,
    query_text: str,
    *,
    limit: int = 50,
    district: str | None = None,
    lb_type: str | None = None,
    year: str | None = None,
) -> list[tuple[str, int]]:
    rows = await conn.fetch(
        """
        SELECT pc.chunk_id
        FROM processed_chunks pc,
             plainto_tsquery('simple', $1) AS q
        WHERE pc.tsv @@ q
          AND ($2::text IS NULL OR pc.district_name = $2)
          AND ($3::text IS NULL OR pc.lb_type = $3)
          AND ($4::text IS NULL OR pc.year_label = $4)
        ORDER BY ts_rank_cd(pc.tsv, q) DESC
        LIMIT $5
        """,
        query_text,
        district,
        lb_type,
        year,
        limit,
    )
    return [(str(r["chunk_id"]), rank) for rank, r in enumerate(rows)]


def rrf_fuse(
    *ranked_lists: list[tuple[str, int]],
    rrf_k: int = 60,
) -> list[str]:
    scores: dict[str, float] = {}
    for ranked in ranked_lists:
        for chunk_id, rank in ranked:
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (rrf_k + rank + 1)
    return sorted(scores, key=lambda k: scores[k], reverse=True)


async def fetch_chunks(
    conn: asyncpg.Connection,
    chunk_ids: list[str],
) -> list[dict]:
    if not chunk_ids:
        return []
    rows = await conn.fetch(
        """
        SELECT chunk_id, pdf_id, chunk_type, section_path,
               display_text, search_text, page_start, page_end,
               token_count, metadata, district_name, lb_name,
               lb_type, project_no, year_label
        FROM processed_chunks
        WHERE chunk_id = ANY($1::uuid[])
        """,
        [uuid.UUID(cid) for cid in chunk_ids],
    )
    row_map = {str(r["chunk_id"]): dict(r) for r in rows}
    return [row_map[cid] for cid in chunk_ids if cid in row_map]


async def hybrid_search(
    conn: asyncpg.Connection,
    query_text: str,
    query_vector: list[float] | None,
    *,
    top_k: int = 10,
    rrf_k: int = 60,
    dense_limit: int = 50,
    fts_limit: int = 50,
    rerank_k: int = 40,
    use_rerank: bool = True,
    district: str | None = None,
    lb_type: str | None = None,
    lb_name: str | None = None,
    year: str | None = None,
) -> list[SearchResult]:
    # The dense arm runs only when there is a real vector to run it with.
    # `query_vector` is None in the deployed image, which ships without the
    # embedding extra; feeding pgvector a zero vector instead would return
    # `dense_limit` rows in arbitrary order and `rrf_fuse` would then weight
    # that arbitrary order equally with the FTS ranking. Skipping the arm
    # leaves fusion with one real list, which is exactly what a single-arm
    # search should be.
    ranked_lists: list[list[tuple[str, int]]] = []
    if query_vector is not None:
        ranked_lists.append(await dense_recall(
            conn, query_vector, limit=dense_limit,
            district=district, lb_type=lb_type, year=year,
        ))
    ranked_lists.append(await fts_recall(
        conn, query_text, limit=fts_limit,
        district=district, lb_type=lb_type, year=year,
    ))

    candidate_k = rerank_k if use_rerank else top_k
    fused_ids = rrf_fuse(*ranked_lists, rrf_k=rrf_k)[:candidate_k]
    chunks = await fetch_chunks(conn, fused_ids)

    if use_rerank and chunks:
        chunks = await rerank_chunks(query_text, chunks, top_k=top_k)
    else:
        chunks = chunks[:top_k]

    results = []
    for i, chunk in enumerate(chunks):
        results.append(SearchResult(
            chunk_id=str(chunk["chunk_id"]),
            pdf_id=str(chunk["pdf_id"]),
            chunk_type=chunk["chunk_type"],
            section_path=chunk["section_path"],
            display_text=chunk["display_text"],
            search_text=chunk["search_text"],
            page_start=chunk["page_start"],
            page_end=chunk["page_end"],
            metadata=chunk["metadata"],
            district_name=chunk.get("district_name"),
            lb_name=chunk.get("lb_name"),
            lb_type=chunk.get("lb_type"),
            project_no=chunk.get("project_no"),
            year_label=chunk.get("year_label"),
            score=chunk.get("rerank_score", 1.0 / (rrf_k + i + 1)),
        ))
    return results
