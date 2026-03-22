"""Chat history CRUD endpoints."""

import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import get_current_user
from ..database import get_pool
from ..models import (
    ChatCreate,
    ChatDetail,
    ChatMessageResponse,
    ChatsListResponse,
    ChatSummary,
    ChatUpdate,
)


def _parse_jsonb(value):
    """Parse JSONB value - handles both dict and string formats."""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return None

router = APIRouter(prefix="/api/chats", tags=["chats"])


@router.get("", response_model=ChatsListResponse)
async def list_chats(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
) -> ChatsListResponse:
    """List all chats for the current user, newest first."""
    user_id = int(current_user["sub"])
    pool = await get_pool()

    offset = (page - 1) * page_size

    async with pool.acquire() as conn:
        # Get total count
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM chats WHERE user_id = $1",
            user_id,
        )

        # Get paginated chats
        rows = await conn.fetch(
            """
            SELECT id, title, created_at, updated_at
            FROM chats
            WHERE user_id = $1
            ORDER BY updated_at DESC
            LIMIT $2 OFFSET $3
            """,
            user_id,
            page_size,
            offset,
        )

    chats = [
        ChatSummary(
            id=row["id"],
            title=row["title"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
        for row in rows
    ]

    return ChatsListResponse(chats=chats, total=total)


@router.post("", response_model=ChatSummary)
async def create_chat(
    data: ChatCreate,
    current_user: dict = Depends(get_current_user),
) -> ChatSummary:
    """Create a new chat."""
    user_id = int(current_user["sub"])
    pool = await get_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO chats (user_id, title)
            VALUES ($1, $2)
            RETURNING id, title, created_at, updated_at
            """,
            user_id,
            data.title,
        )

    return ChatSummary(
        id=row["id"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("/{chat_id}", response_model=ChatDetail)
async def get_chat(
    chat_id: UUID,
    current_user: dict = Depends(get_current_user),
) -> ChatDetail:
    """Get a chat with all its messages."""
    user_id = int(current_user["sub"])
    pool = await get_pool()

    async with pool.acquire() as conn:
        # Get chat
        chat_row = await conn.fetchrow(
            """
            SELECT id, title, created_at, updated_at
            FROM chats
            WHERE id = $1 AND user_id = $2
            """,
            chat_id,
            user_id,
        )

        if not chat_row:
            raise HTTPException(status_code=404, detail="Chat not found")

        # Get messages
        message_rows = await conn.fetch(
            """
            SELECT id, role, content, sources, tool_calls, created_at
            FROM chat_messages
            WHERE chat_id = $1
            ORDER BY created_at ASC
            """,
            chat_id,
        )

    messages = [
        ChatMessageResponse(
            id=row["id"],
            role=row["role"],
            content=row["content"],
            sources=_parse_jsonb(row["sources"]),
            tool_calls=_parse_jsonb(row["tool_calls"]),
            created_at=row["created_at"],
        )
        for row in message_rows
    ]

    return ChatDetail(
        id=chat_row["id"],
        title=chat_row["title"],
        messages=messages,
        created_at=chat_row["created_at"],
        updated_at=chat_row["updated_at"],
    )


@router.patch("/{chat_id}", response_model=ChatSummary)
async def update_chat(
    chat_id: UUID,
    data: ChatUpdate,
    current_user: dict = Depends(get_current_user),
) -> ChatSummary:
    """Update a chat's title."""
    user_id = int(current_user["sub"])
    pool = await get_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE chats
            SET title = COALESCE($3, title), updated_at = now()
            WHERE id = $1 AND user_id = $2
            RETURNING id, title, created_at, updated_at
            """,
            chat_id,
            user_id,
            data.title,
        )

    if not row:
        raise HTTPException(status_code=404, detail="Chat not found")

    return ChatSummary(
        id=row["id"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.delete("/{chat_id}", status_code=204)
async def delete_chat(
    chat_id: UUID,
    current_user: dict = Depends(get_current_user),
) -> None:
    """Delete a chat and all its messages."""
    user_id = int(current_user["sub"])
    pool = await get_pool()

    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM chats WHERE id = $1 AND user_id = $2",
            chat_id,
            user_id,
        )

    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Chat not found")
