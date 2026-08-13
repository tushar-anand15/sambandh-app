"""What the internal metrics endpoint has to get right.

Two problems this file has to solve before it can assert anything.

**The tables are not in the fixture slice.** ``users``, ``chats`` and
``chat_messages`` are the application's own, created by Alembic, while
``master_slice.sql`` holds only the public record schemas (``core``,
``finance``, ``meetings``, ``elections``). Running ``alembic upgrade head``
against the test database would also drag in pgvector, the embedding tables and
an extension ``postgres-test`` does not carry. So this module creates exactly
the three tables it needs, emitting their DDL from ``app.models_db`` — the
declared source of truth for the schema — rather than from hand-written SQL that
could drift away from it. A column renamed in the ORM changes the fixture with
it.

**The router may not be mounted yet.** ``main.py`` is wired by another hand, so
``metrics_client`` uses the real app when ``/api/metrics`` is registered there
and falls back to an app holding just this router when it is not. Either way the
router under test is the real one, and once the wiring lands the first branch is
what runs.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.auth import create_access_token
from app.models_db import Chat, ChatMessage, User
from app.routers.metrics import router as metrics_router

APP_TABLES = (User.__table__, Chat.__table__, ChatMessage.__table__)


def _ddl() -> list[str]:
    """CREATE TABLE for the three application tables, from the ORM itself."""
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateTable

    dialect = postgresql.dialect()
    return [str(CreateTable(table).compile(dialect=dialect)) for table in APP_TABLES]


@pytest_asyncio.fixture
async def app_tables(test_pool):
    """The Alembic-owned tables, created empty and dropped afterwards.

    Function-scoped: every test here seeds its own rows and asserts on counts,
    so leaking rows between them would make each test's arithmetic depend on the
    order the suite happened to run in.
    """
    async with test_pool.acquire() as conn:
        await conn.execute(
            "DROP TABLE IF EXISTS chat_messages, chats, users CASCADE"
        )
        for statement in _ddl():
            await conn.execute(statement)
    yield
    async with test_pool.acquire() as conn:
        await conn.execute(
            "DROP TABLE IF EXISTS chat_messages, chats, users CASCADE"
        )


@pytest_asyncio.fixture
async def metrics_client(app_tables):
    """A client for the metrics endpoint, wired or not."""
    from app.main import app as main_app

    mounted = any(
        getattr(route, "path", None) == "/api/metrics" for route in main_app.routes
    )
    app = main_app
    if not mounted:
        app = FastAPI()
        app.include_router(metrics_router)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


@pytest.fixture
def token() -> str:
    return create_access_token({"sub": "1", "email": "operator@example.org"})


@pytest.fixture
def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------


async def _user(conn, email: str, days_ago: int) -> int:
    return await conn.fetchval(
        "INSERT INTO users (email, password_hash, full_name, created_at) "
        "VALUES ($1, 'x', $2, now() - make_interval(days => $3)) RETURNING id",
        email,
        email.split("@")[0],
        days_ago,
    )


async def _chat(conn, user_id: int, title: str = "A chat"):
    return await conn.fetchval(
        "INSERT INTO chats (user_id, title, created_at, updated_at) "
        "VALUES ($1, $2, now(), now()) RETURNING id",
        user_id,
        title,
    )


async def _message(conn, chat_id, role: str, content: str, days_ago: int = 0):
    await conn.execute(
        "INSERT INTO chat_messages (chat_id, role, content, created_at) "
        "VALUES ($1, $2, $3, now() - make_interval(days => $4))",
        chat_id,
        role,
        content,
        days_ago,
    )


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_reports_signups_per_week_and_questions_asked(metrics_client, db, auth):
    """The two headline numbers, from rows the test put there."""
    alice = await _user(db, "alice@example.org", days_ago=0)
    bob = await _user(db, "bob@example.org", days_ago=0)
    await _user(db, "carol@example.org", days_ago=21)

    chat = await _chat(db, alice)
    await _message(db, chat, "user", "What did Chalakudy spend in 2023-24?")
    await _message(db, chat, "assistant", "₹11.69 crore, from the plan records.")
    second = await _chat(db, bob)
    await _message(db, second, "user", "How many meetings in 2022-23?")

    response = await metrics_client.get("/api/metrics", headers=auth)

    assert response.status_code == 200
    body = response.json()

    assert body["questions_asked"] == 2
    assert body["users_total"] == 3
    assert body["saved_chats"] == 2

    weeks = body["signups_per_week"]
    assert len(weeks) == body["weeks"] == 12
    # The series is continuous and ends on the current week, so a reader can
    # tell a quiet week from a missing one.
    assert [entry["signups"] for entry in weeks][-1] == 2
    assert sum(entry["signups"] for entry in weeks) == body["signups_total"] == 3


async def test_counts_returning_users_by_separate_days(metrics_client, db, auth):
    """Two questions in one sitting is one visit; coming back is returning."""
    once = await _user(db, "once@example.org", days_ago=10)
    again = await _user(db, "again@example.org", days_ago=10)

    burst = await _chat(db, once)
    await _message(db, burst, "user", "First question", days_ago=3)
    await _message(db, burst, "user", "Second question, same day", days_ago=3)

    spread = await _chat(db, again)
    await _message(db, spread, "user", "Asked on one day", days_ago=5)
    await _message(db, spread, "user", "Came back later", days_ago=1)

    body = (await metrics_client.get("/api/metrics", headers=auth)).json()

    assert body["returning_users"] == 1


async def test_reports_the_out_of_index_refusal_share(metrics_client, db, auth):
    """The health check on the assistant's scoping.

    Three assistant answers, one of them a refusal for a body outside Thrissur.
    If this number climbs in production, readers are asking about places the
    corpus does not hold.
    """
    user = await _user(db, "reader@example.org", days_ago=2)
    chat = await _chat(db, user)

    await _message(db, chat, "user", "Kollam panchayat spending?")
    await _message(
        db,
        chat,
        "assistant",
        "That is outside the records this assistant holds — it covers "
        "Thrissur district only.",
    )
    await _message(db, chat, "assistant", "Chalakudy spent ₹11.69 crore in 2023-24.")
    await _message(db, chat, "assistant", "357 projects were formulated that year.")

    body = (await metrics_client.get("/api/metrics", headers=auth)).json()

    assert body["assistant"]["answers"] == 3
    assert body["assistant"]["out_of_index_refusals"] == 1
    assert body["assistant"]["out_of_index_share"] == pytest.approx(1 / 3)


async def test_refusal_share_is_null_rather_than_zero_with_no_answers(
    metrics_client, db, auth
):
    """A share of nothing is unknown, not zero. Drawing 0% would be a claim."""
    body = (await metrics_client.get("/api/metrics", headers=auth)).json()

    assert body["assistant"]["answers"] == 0
    assert body["assistant"]["out_of_index_share"] is None


# ---------------------------------------------------------------------------
# Not public
# ---------------------------------------------------------------------------


async def test_without_a_token_returns_401(metrics_client):
    """The one read endpoint in this plan that is not public."""
    response = await metrics_client.get("/api/metrics")

    assert response.status_code in (401, 403)


async def test_with_an_invalid_token_returns_401(metrics_client):
    response = await metrics_client.get(
        "/api/metrics", headers={"Authorization": "Bearer not-a-token"}
    )

    assert response.status_code == 401


async def test_with_an_expired_token_returns_401(metrics_client):
    from jose import jwt

    from app.config import settings

    expired = jwt.encode(
        {"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

    response = await metrics_client.get(
        "/api/metrics", headers={"Authorization": f"Bearer {expired}"}
    )

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# No personal data leaves the endpoint
# ---------------------------------------------------------------------------


async def test_the_payload_carries_no_email_name_or_question_text(
    metrics_client, db, auth
):
    """Every number is an aggregate. Nothing identifies a person or a question."""
    user = await _user(db, "identifiable@example.org", days_ago=1)
    chat = await _chat(db, user, title="A title a person typed")
    await _message(db, chat, "user", "A question with distinctive wording in it")
    await _message(db, chat, "assistant", "An answer with distinctive wording in it")

    raw = (await metrics_client.get("/api/metrics", headers=auth)).text

    for forbidden in (
        "identifiable@example.org",
        "identifiable",
        "A title a person typed",
        "distinctive wording",
    ):
        assert forbidden not in raw

    body = (await metrics_client.get("/api/metrics", headers=auth)).json()
    assert set(body) == {
        "weeks",
        "signups_per_week",
        "signups_total",
        "users_total",
        "questions_asked",
        "saved_chats",
        "returning_users",
        "assistant",
    }


# ---------------------------------------------------------------------------
# The window
# ---------------------------------------------------------------------------


async def test_the_week_window_is_selectable_and_bounded(metrics_client, db, auth):
    await _user(db, "recent@example.org", days_ago=0)
    await _user(db, "older@example.org", days_ago=40)

    four = (await metrics_client.get("/api/metrics?weeks=4", headers=auth)).json()
    twenty = (await metrics_client.get("/api/metrics?weeks=20", headers=auth)).json()

    assert len(four["signups_per_week"]) == 4
    assert four["signups_total"] == 1
    assert twenty["signups_total"] == 2

    assert (await metrics_client.get("/api/metrics?weeks=0", headers=auth)).status_code == 422
