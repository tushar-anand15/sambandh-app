FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

WORKDIR /app

# No `--extra embedding`. That extra is torch, FlagEmbedding,
# sentence-transformers and transformers: about 1.5 GB of wheels for a bge-m3
# embedder and a Jina cross-encoder that this deployment does not run. The VM
# has two vCPUs, no GPU, and 2 GB of memory it is already using to serve the
# site; loading a 2 GB model into it was never going to happen, and the weights
# were being downloaded at runtime rather than baked in, so the image carried
# the whole of torch to call code that immediately fell back.
#
# `app/embedder.py` and `app/reranker.py` both import their libraries inside a
# try/except and degrade when the import fails, so this is a supported
# configuration rather than a broken one: search runs the FTS arm only, and
# `hybrid_search` skips the dense arm rather than fusing a zero vector into it.
#
# Adding the extra back is one word here. Doing so also needs a machine that
# can hold the weights and a persistent cache mounted for them.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY . .
RUN uv sync --frozen --no-dev

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
