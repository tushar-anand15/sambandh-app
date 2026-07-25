# GramSAMBANDH

Search and conversational Q&A over **Kerala municipal & panchayat project records** — the local-government spending documents ("Sulekha" project PDFs) that are public but effectively unreadable at scale. GramSAMBANDH turns them into a searchable, bilingual (Malayalam + English) knowledge base you can query in plain language.

This repo is the **full-stack application**: a FastAPI backend with hybrid retrieval and an agentic chat layer, plus the web frontend. The document ingestion/RAG pipeline lives in [`sambandh-preprocessing`](https://github.com/tushar-anand15/sambandh-preprocessing).

## What it does

- **Hybrid retrieval** over local-government project records: dense vector search (`pgvector`) + Postgres full-text search, fused with reciprocal rank fusion (RRF) and a cross-encoder reranker.
- **Bilingual** — handles Malayalam and English queries against a mixed-language corpus.
- **Agentic chat** — a LangChain-based agent answers questions ("road construction projects in Chalakkudy", "budget for project 273") with page-level citations back to source documents.
- **Auth + chat history** — user accounts, saved conversations, streaming responses.

## Architecture

```
frontend/   → web client
backend/    → FastAPI app: auth, search, chat (streaming), documents
              hybrid retrieval (pgvector + FTS + RRF + reranker)
eval/       → retrieval-quality evaluation harness
```

Data (Postgres + pgvector) is populated by the preprocessing pipeline in the companion repo.

## Running locally

```bash
# Backend (Python, uv)
cd backend
uv sync
cp .env.example .env        # fill in DB + model settings
uv run uvicorn app.main:app --reload

# Frontend
cd frontend
npm install && npm run dev
```

Or bring up the full stack with Docker:

```bash
docker compose up
```

## Status

A working prototype — see `eval/eval_report.md` for retrieval-quality benchmarks on the Kerala corpus. Actively iterated on.
