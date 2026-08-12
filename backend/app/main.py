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
from .routers.maps import router as maps_router
from .routers.meetings import router as meetings_router
from .routers.search import router as search_router

logger = logging.getLogger(__name__)


def _warmup_models():
    """Pre-load embedding and reranker models to avoid cold-start latency."""
    try:
        from .embedder import _get_model
        _get_model()
        logger.info("Embedder model loaded")
    except Exception as e:
        logger.warning("Embedder warmup failed: %s", e)

    try:
        from .reranker import get_reranker
        get_reranker()
        logger.info("Reranker model loaded")
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

# Public, unauthenticated read API. These carry no `Depends(get_current_user)`
# by design: the data is public records about public bodies, and the assistant
# is the only part of the site behind a login.
app.include_router(bodies_router)
app.include_router(finances_router)
app.include_router(meetings_router)
app.include_router(elections_router)
app.include_router(maps_router)
app.include_router(download_router)

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(chat_stream_router)
app.include_router(chats_router)
app.include_router(search_router)
