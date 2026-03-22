"""
Agent tools for the GramSAMBANDH chatbot.

Each tool gets its own DB connection from the pool to avoid asyncpg conflicts.
"""

from __future__ import annotations

import json
import uuid
from typing import Optional

from langchain_core.tools import tool

from .config import settings
from .database import get_pool
from .embedder import embed_query
from .search import hybrid_search

SOURCES_MARKER = "\n\n<!-- SOURCES_JSON:"


def _format_results(results) -> str:
    """Format search results into a readable string for the LLM, with embedded source metadata."""
    if not results:
        return "No results found."

    parts = []
    sources = []
    
    for i, r in enumerate(results, 1):
        parts.append(
            f"**Result {i}** — {r.lb_name or 'Unknown LB'}, "
            f"Project {r.project_no or 'N/A'} "
            f"[{r.chunk_type}] (pages {r.page_start}-{r.page_end}, "
            f"score: {r.score:.3f})\n{r.display_text}"
        )
        sources.append({
            "document_id": str(r.pdf_id),
            "chunk_id": str(r.chunk_id),
            "document_title": f"Project {r.project_no or 'N/A'} — {r.lb_name or 'Unknown'}",
            "excerpt": r.display_text[:200] + ("..." if len(r.display_text) > 200 else ""),
            "page": r.page_start,
            "lb_name": r.lb_name,
            "score": round(r.score, 3),
        })
    
    formatted = "\n\n---\n\n".join(parts)
    sources_json = json.dumps(sources[:5])
    
    return f"{formatted}{SOURCES_MARKER}{sources_json} -->"


@tool
async def search_documents(
    query: str,
    district: Optional[str] = None,
    lb_name: Optional[str] = None,
    lb_type: Optional[str] = None,
    year: Optional[str] = None,
    top_k: int = 8,
) -> str:
    """Search across all project documents using semantic and keyword search.

    Use this tool to find information about projects, budgets, activities,
    beneficiaries, or any other content in the Sulekha project documents.

    Args:
        query: The search query in English or Malayalam.
        district: Filter by district name (e.g. "Thrissur").
        lb_name: Filter by local body name (e.g. "Chalakkudy Municipality").
        lb_type: Filter by local body type (e.g. "Grama Panchayat", "Municipality").
        year: Filter by fiscal year (e.g. "2025-2026").
        top_k: Number of results to return (default 8).
    """
    query_vector = await embed_query(query)
    pool = await get_pool()
    async with pool.acquire() as conn:
        results = await hybrid_search(
            conn,
            query_text=query,
            query_vector=query_vector,
            top_k=top_k,
            rrf_k=settings.rrf_k,
            dense_limit=settings.dense_recall_k,
            fts_limit=settings.fts_recall_k,
            rerank_k=settings.rerank_candidate_k,
            use_rerank=settings.reranker_enabled,
            district=district,
            lb_type=lb_type,
            year=year,
        )
    return _format_results(results)


@tool
async def get_project_details(
    project_no: str,
    lb_name: str,
) -> str:
    """Look up a specific project by its project number and local body name.

    Use this when the user asks about a specific project number.

    Args:
        project_no: The project number (e.g. "273", "49").
        lb_name: The local body name (e.g. "Chalakkudy Municipality").
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT chunk_id, pdf_id, chunk_type, section_path, display_text,
                   page_start, page_end, district_name, lb_name,
                   project_no, year_label
            FROM processed_chunks
            WHERE project_no = $1 AND lb_name = $2
            ORDER BY chunk_index
            """,
            project_no,
            lb_name,
        )

    if not rows:
        return f"No data found for project {project_no} in {lb_name}."

    parts = []
    for r in rows:
        parts.append(
            f"[{r['chunk_type']}] (pages {r['page_start']}-{r['page_end']})\n"
            f"{r['display_text']}"
        )
    
    header = f"**Project {project_no} — {lb_name}** ({len(rows)} chunks)\n\n"
    formatted = header + "\n\n---\n\n".join(parts[:15])
    
    # Use pdf_id from the first chunk as document_id
    document_id = str(rows[0]["pdf_id"])
    first_row = rows[0]
    sources = [{
        "document_id": document_id,
        "chunk_id": str(first_row["chunk_id"]),
        "document_title": f"Project {project_no} — {lb_name}",
        "excerpt": first_row["display_text"][:200] + ("..." if len(first_row["display_text"]) > 200 else ""),
        "page": first_row["page_start"],
        "lb_name": lb_name,
        "score": 1.0,
    }]
    sources_json = json.dumps(sources)
    
    return f"{formatted}{SOURCES_MARKER}{sources_json} -->"


@tool
async def list_projects(
    lb_name: Optional[str] = None,
    lb_type: Optional[str] = None,
    limit: int = 20,
) -> str:
    """List projects with optional filters. Shows project numbers and names.

    Use this to browse available projects or answer questions like
    "how many projects does X have?" or "what projects are in Y?".

    Args:
        lb_name: Filter by local body name.
        lb_type: Filter by local body type.
        limit: Maximum number of projects to return (default 20).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions = []
        params: list = []
        idx = 1

        if lb_name:
            conditions.append(f"d.lb_name = ${idx}")
            params.append(lb_name)
            idx += 1
        if lb_type:
            conditions.append(f"d.lb_type = ${idx}")
            params.append(lb_type)
            idx += 1

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        count_row = await conn.fetchrow(
            f"SELECT count(*) as total FROM documents d {where}", *params
        )

        rows = await conn.fetch(
            f"""
            SELECT d.project_no, d.project_name, d.lb_name, d.lb_type,
                   d.page_count
            FROM documents d
            {where}
            ORDER BY d.lb_name, d.project_no
            LIMIT ${idx}
            """,
            *params,
            limit,
        )

    total = count_row["total"]
    if not rows:
        return "No projects found matching the filters."

    lines = [f"**Found {total} projects** (showing {len(rows)}):\n"]
    for r in rows:
        name = r["project_name"] or "Untitled"
        lines.append(
            f"- **Project {r['project_no']}** — {name} "
            f"({r['lb_name']}, {r['lb_type']}, {r['page_count'] or '?'} pages)"
        )
    return "\n".join(lines)


@tool
async def compare_projects(
    project_nos: list[str],
    lb_name: str,
    aspect: Optional[str] = None,
) -> str:
    """Compare multiple projects from the same local body.

    Retrieves key details for each project so you can compare them.

    Args:
        project_nos: List of project numbers to compare (e.g. ["273", "301"]).
        lb_name: The local body name.
        aspect: Optional aspect to focus on (e.g. "budget", "beneficiaries").
    """
    parts = []
    pool = await get_pool()

    for pno in project_nos[:5]:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT chunk_type, display_text, page_start
                FROM processed_chunks
                WHERE project_no = $1 AND lb_name = $2
                ORDER BY chunk_index
                LIMIT 10
                """,
                pno,
                lb_name,
            )

        if rows:
            content = "\n".join(
                f"[{r['chunk_type']}] {r['display_text'][:300]}" for r in rows
            )
            parts.append(f"### Project {pno} — {lb_name}\n\n{content}")
        else:
            parts.append(f"### Project {pno} — {lb_name}\n\nNo data found.")

    return "\n\n---\n\n".join(parts)


ALL_TOOLS = [search_documents, get_project_details, list_projects, compare_projects]
