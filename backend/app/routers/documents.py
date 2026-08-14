import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from ..auth import get_current_user
from ..database import get_pool
from ..presign import storage_client

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("")
async def list_documents(
    q: str = "",
    district: str = "",
    lb_type: str = "",
    year: str = "",
    page: int = 1,
    page_size: int = 20,
    _current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions: list[str] = []
        params: list = []
        idx = 1

        if q:
            conditions.append(
                f"""d.pdf_id IN (
                    SELECT DISTINCT pdf_id FROM processed_chunks
                    WHERE tsv @@ plainto_tsquery('simple', ${idx})
                )"""
            )
            params.append(q)
            idx += 1
        if district:
            conditions.append(f"d.district_name = ${idx}")
            params.append(district)
            idx += 1
        if lb_type:
            conditions.append(f"d.lb_type = ${idx}")
            params.append(lb_type)
            idx += 1
        if year:
            conditions.append(f"d.year_label = ${idx}")
            params.append(year)
            idx += 1

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        offset = (page - 1) * page_size

        count_row = await conn.fetchrow(
            f"SELECT count(*) AS total FROM documents d {where}",
            *params,
        )
        total = count_row["total"]

        rows = await conn.fetch(
            f"""
            SELECT d.pdf_id, d.district_name, d.lb_name, d.lb_type,
                   d.project_no, d.project_name, d.year_label,
                   d.gcs_path, d.gcs_bucket, d.page_count,
                   d.file_size_bytes
            FROM documents d
            {where}
            ORDER BY d.district_name, d.lb_name, d.project_no
            LIMIT ${idx} OFFSET ${idx + 1}
            """,
            *params,
            page_size,
            offset,
        )

        documents = [
            {
                "id": str(r["pdf_id"]),
                "title": r["project_name"] or r["project_no"] or "Untitled",
                "project_no": r["project_no"],
                "district": r["district_name"],
                "lb_name": r["lb_name"],
                "lb_type": r["lb_type"],
                "year": r["year_label"],
                "page_count": r["page_count"],
                "file_size_bytes": r["file_size_bytes"],
            }
            for r in rows
        ]

    return {"documents": documents, "total": total, "page": page}


@router.get("/filters")
async def get_filters(_current_user: dict = Depends(get_current_user)):
    """Distinct values for each filter dimension, and the index's own extent.

    ``local_bodies`` and ``documents`` are read from the corpus rather than
    declared, because the assistant page states its coverage in a banner and
    restricts its body selector to what has been indexed. A hand-kept list would
    outlive an ingest and offer a body the retrieval cannot answer for, which is
    the one failure the scoping work exists to prevent.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        districts = await conn.fetch(
            "SELECT DISTINCT district_name FROM documents WHERE district_name IS NOT NULL ORDER BY 1"
        )
        lb_types = await conn.fetch(
            "SELECT DISTINCT lb_type FROM documents WHERE lb_type IS NOT NULL ORDER BY 1"
        )
        years = await conn.fetch(
            "SELECT DISTINCT year_label FROM documents WHERE year_label IS NOT NULL ORDER BY 1"
        )
        local_bodies = await conn.fetch(
            """
            SELECT lb_name, min(lb_type) AS lb_type, min(district_name) AS district_name,
                   count(*) AS documents
            FROM documents
            WHERE lb_name IS NOT NULL
            GROUP BY lb_name
            ORDER BY lb_name
            """
        )
        total = await conn.fetchval("SELECT count(*) FROM documents")

    return {
        "districts": [r["district_name"] for r in districts],
        "lb_types": [r["lb_type"] for r in lb_types],
        "years": [r["year_label"] for r in years],
        "local_bodies": [
            {
                "lb_name": r["lb_name"],
                "lb_type": r["lb_type"],
                "district_name": r["district_name"],
                "documents": r["documents"],
            }
            for r in local_bodies
        ],
        "documents": total,
    }


@router.get("/{doc_id}")
async def get_document(doc_id: str, _current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        doc = await conn.fetchrow(
            """
            SELECT pdf_id, district_name, lb_name, lb_type, project_no,
                   project_name, year_label, gcs_path, gcs_bucket,
                   page_count, file_size_bytes, block_count, table_count
            FROM documents WHERE pdf_id = $1
            """,
            _uuid.UUID(doc_id),
        )
        if not doc:
            return {"id": doc_id, "chunks": []}

        rows = await conn.fetch(
            """
            SELECT chunk_id, chunk_index, chunk_type, section_path,
                   display_text, search_text, page_start, page_end,
                   token_count, metadata
            FROM processed_chunks
            WHERE pdf_id = $1
            ORDER BY chunk_index
            """,
            _uuid.UUID(doc_id),
        )

        chunks = [
            {
                "id": str(r["chunk_id"]),
                "chunk_type": r["chunk_type"],
                "section_path": r["section_path"],
                "display_text": r["display_text"],
                "search_text": r["search_text"],
                "page_start": r["page_start"],
                "page_end": r["page_end"],
                "metadata": r["metadata"],
            }
            for r in rows
        ]

    return {
        "id": str(doc["pdf_id"]),
        "title": doc["project_name"] or doc["project_no"] or "Untitled",
        "project_no": doc["project_no"],
        "district": doc["district_name"],
        "lb_name": doc["lb_name"],
        "lb_type": doc["lb_type"],
        "year": doc["year_label"],
        "page_count": doc["page_count"],
        "file_size_bytes": doc["file_size_bytes"],
        "chunks": chunks,
    }


@router.get("/{doc_id}/pdf")
async def get_document_pdf(
    doc_id: str, _current_user: dict = Depends(get_current_user)
):
    """Proxy the PDF from GCS to avoid CORS when loading in the browser.

    The public Finances page does not come through here: it is handed a signed
    Cloud Storage URL and fetches the file directly (``app/presign.py``). This
    route stays a proxy because the assistant's viewer sends an Authorization
    header with the request, and a redirect would carry that header on to Cloud
    Storage, which rejects a signed request that also presents a bearer token.
    Both paths now read GCS on one configured identity.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        doc = await conn.fetchrow(
            "SELECT gcs_bucket, gcs_path FROM documents WHERE pdf_id = $1",
            _uuid.UUID(doc_id),
        )
    if not doc:
        raise HTTPException(status_code=404, detail="No document available.")

    try:
        bucket = storage_client().bucket(doc["gcs_bucket"])
        blob = bucket.blob(doc["gcs_path"])
        content = blob.download_as_bytes()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="The document could not be opened. Try again in a moment.",
        ) from exc

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"},
    )
