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

## Tests

```bash
# Backend — pytest against a real Postgres holding the fixture slice
docker compose up -d postgres-test
cd backend && uv sync --extra dev && uv run pytest

# Frontend — vitest (jsdom + testing-library + MSW)
cd frontend && npm install && npm run test

# End to end — Playwright starts the Vite dev server itself
cd frontend && npx playwright install chromium && npm run test:e2e
```

Backend tests run against Postgres rather than mocks, because every public
endpoint is a SQL query against materialised rollups and a mocked database
would prove nothing. `backend/tests/fixtures/master_slice.sql` is seven local
bodies and every row they touch, exported from the master database by
`backend/tests/fixtures/build_slice.py`; regenerate it with

```bash
cd backend && uv run python tests/fixtures/build_slice.py
```

Frontend tests mock at the network boundary. All handlers live in
`frontend/src/test/handlers.ts`, so a payload change breaks one file rather
than twenty.

## Status

A working prototype — see `eval/eval_report.md` for retrieval-quality benchmarks on the Kerala corpus. Actively iterated on.
