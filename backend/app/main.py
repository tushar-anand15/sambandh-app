import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import close_pool, get_pool
from .routers.auth import router as auth_router
from .routers.bodies import router as bodies_router
from .routers.chat import router as chat_router
from .routers.chat_stream import router as chat_stream_router
from .routers.chats import router as chats_router
from .routers.documents import router as documents_router
from .routers.download import router as download_router
from .routers.elections import router as elections_router
from .routers.finances import router as finances_router
from .routers.geo import router as geo_router
from .routers.maps import router as maps_router
from .routers.method import router as method_router
from .routers.metrics import router as metrics_router
from .routers.meetings import router as meetings_router
from .routers.search import router as search_router

logger = logging.getLogger(__name__)


def _warmup_models():
    """Say which retrieval mode this process is in, at startup.

    Nothing is pre-loaded any more. Query embedding is an API call, and the
    reranker is absent from the deployed image, which does not install the
    `embedding` extra — that is the expected configuration, not a failure.

    It is worth logging because both degrade silently. An earlier version
    reported "model loaded" whether or not anything had loaded, which is the
    kind of log line that costs an hour later.
    """
    from .config import settings

    try:
        from .embedder import embeddings_available

        logger.info(
            "Query embedding: %s",
            settings.embed_model
            if embeddings_available()
            else "not configured — search runs the full-text arm only",
        )
    except Exception as e:
        logger.warning("Embedder check failed: %s", e)

    try:
        from .reranker import get_reranker
        logger.info(
            "Reranker %s",
            "loaded" if get_reranker() is not None
            else "not installed or disabled — results are returned in fusion order",
        )
    except Exception as e:
        logger.warning("Reranker warmup failed: %s", e)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await get_pool()
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, _warmup_models)
    yield
    await close_pool()


app = FastAPI(title="GramSAMBANDH API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["ops"], include_in_schema=False)
async def health() -> dict[str, str]:
    """What a deploy waits for before it stops being reversible.

    nginx answers `/health` from its own config with a literal string, which
    proves nginx is up and proves nothing about the container behind it. This
    one takes a connection out of the pool and runs a query, so it fails while
    the database is still starting, fails when a migration left the pool unable
    to connect, and fails when the image booted but cannot reach `db` — the
    three ways a deploy of this app goes wrong that a process check would call
    healthy.

    It deliberately does not touch the embedding or reranker models. Those load
    in the background after startup (see `_warmup_models`), and the site serves
    every public page without them, so waiting on them would turn a slow warmup
    into a failed deployment.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok"}

# Public, unauthenticated read API. These carry no `Depends(get_current_user)`
# by design: the data is public records about public bodies, and the assistant
# is the only part of the site behind a login.
app.include_router(bodies_router)
app.include_router(finances_router)
app.include_router(meetings_router)
app.include_router(elections_router)
app.include_router(maps_router)
app.include_router(download_router)
# The boundary layer files /api/maps points at.
app.include_router(geo_router)
app.include_router(method_router)

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(chat_stream_router)
app.include_router(chats_router)
app.include_router(search_router)
# Authenticated: the only non-public read endpoint on the site.
app.include_router(metrics_router)
