"""Pytest configuration and shared fixtures for the GramSAMBANDH backend.

Tests run against a **real** Postgres, not a mock. Every public endpoint this
project adds is a SQL query against materialised rollups, so a mocked database
would prove nothing that can actually break.

What this module does, once per session:

1. Opens a pool against the test database (``postgres-test`` in
   ``docker-compose.yml``, port 55433 on the host).
2. Drops and reloads ``fixtures/master_slice.sql`` — six local bodies and every
   row they touch, generated from the master database by ``build_slice.py``.
3. Installs that pool as ``app.database._pool``, so ``get_pool()`` returns it
   everywhere in the application without any router being aware of tests.
4. Yields an httpx client speaking ASGI directly to ``app.main:app``.

Usage:

    docker compose up -d postgres-test
    uv sync --extra dev
    uv run pytest

There is deliberately no skip-if-unavailable path. A suite that goes green
because the database was missing is worse than one that fails loudly, and this
harness exists precisely so later units cannot pass vacuously.
"""

from __future__ import annotations

import os
from pathlib import Path

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://sambandh:sambandh@localhost:55433/sambandh_test",
)

SLICE_PATH = Path(__file__).parent / "fixtures" / "master_slice.sql"

# The schemas the slice owns. Dropped and rebuilt each session so a stale test
# database can never make a passing run mean something it does not.
SLICE_SCHEMAS = ("core", "finance", "meetings", "elections")

_UNREACHABLE = (
    "Cannot reach the test database at {url}.\n"
    "Start it with:  docker compose up -d postgres-test\n"
    "Or point TEST_DATABASE_URL at another empty Postgres.\n"
    "Original error: {err}"
)


async def _load_slice(conn: asyncpg.Connection) -> None:
    if not SLICE_PATH.exists():
        raise RuntimeError(
            f"Fixture slice missing at {SLICE_PATH}. "
            "Regenerate it with: uv run python tests/fixtures/build_slice.py"
        )
    await conn.execute(
        "DROP SCHEMA IF EXISTS " + ", ".join(SLICE_SCHEMAS) + " CASCADE"
    )
    await conn.execute(SLICE_PATH.read_text())


@pytest_asyncio.fixture(scope="session")
async def test_pool():
    """A pool against the test database, loaded with the fixture slice.

    Also stands in for the application's own pool: ``app.database.get_pool()``
    returns the cached ``_pool`` when one is set, so assigning it here overrides
    the pool for every router without touching application code.
    """
    from app import database

    try:
        pool = await asyncpg.create_pool(TEST_DATABASE_URL, min_size=1, max_size=4)
    except (OSError, asyncpg.PostgresError) as err:  # pragma: no cover - setup failure
        pytest.fail(_UNREACHABLE.format(url=TEST_DATABASE_URL, err=err), pytrace=False)

    async with pool.acquire() as conn:
        await _load_slice(conn)

    previous, database._pool = database._pool, pool
    try:
        yield pool
    finally:
        database._pool = previous
        await pool.close()


@pytest_asyncio.fixture
async def db(test_pool: asyncpg.Pool):
    """A connection for asserting directly against the fixture slice."""
    async with test_pool.acquire() as conn:
        yield conn


@pytest_asyncio.fixture(scope="session")
async def client(test_pool: asyncpg.Pool):
    """An httpx client speaking ASGI straight to the app.

    ASGITransport does not run the lifespan, which is what we want: the app's
    startup warms embedding and reranker models, and no test in this suite needs
    a 2 GB model download to answer a SQL query.
    """
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


@pytest.fixture(scope="session")
def chalakudy() -> str:
    """The worked example throughout the plan: Chalakudy Municipality."""
    return "M08032"


@pytest.fixture(scope="session")
def mattannur() -> str:
    """Finance and meetings, but ``in_elections = false``."""
    return "M13057"
