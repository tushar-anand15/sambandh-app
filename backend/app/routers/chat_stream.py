"""
SSE streaming chat endpoint using the LangChain agent with persistent chat history.
"""

from __future__ import annotations

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from langchain_litellm import ChatLiteLLM
from sse_starlette.sse import EventSourceResponse

from ..agent import get_agent
from ..agent_tools import SOURCES_MARKER
from ..auth import get_current_user
from ..config import settings
from ..database import get_pool
from ..models import ChatRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _extract_sources_from_tool_output(tool_output: str) -> list[dict]:
    """
    Extract structured sources from the SOURCES_JSON marker embedded in tool output.
    """
    if SOURCES_MARKER not in tool_output:
        return []

    try:
        start = tool_output.index(SOURCES_MARKER) + len(SOURCES_MARKER)
        end = tool_output.index(" -->", start)
        sources_json = tool_output[start:end]
        sources = json.loads(sources_json)
        logger.info("Extracted %d sources from tool output", len(sources))
        return sources
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning("Failed to extract sources: %s", e)
        return []


async def _create_chat(user_id: int) -> UUID:
    """Create a new chat and return its ID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO chats (user_id) VALUES ($1) RETURNING id",
            user_id,
        )
    return row["id"]


async def _get_chat_history(chat_id: UUID, user_id: int) -> list[dict]:
    """Load previous messages from a chat for context."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify ownership
        owner = await conn.fetchval(
            "SELECT user_id FROM chats WHERE id = $1",
            chat_id,
        )
        if owner != user_id:
            raise HTTPException(status_code=404, detail="Chat not found")

        rows = await conn.fetch(
            """
            SELECT role, content
            FROM chat_messages
            WHERE chat_id = $1
            ORDER BY created_at ASC
            """,
            chat_id,
        )
    return [{"role": row["role"], "content": row["content"]} for row in rows]


async def _save_message(
    chat_id: UUID,
    role: str,
    content: str,
    sources: list[dict] | None = None,
    tool_calls: list[dict] | None = None,
) -> None:
    """Save a message to the database."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Use jsonb casting for proper JSONB storage
        await conn.execute(
            """
            INSERT INTO chat_messages (chat_id, role, content, sources, tool_calls)
            VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
            """,
            chat_id,
            role,
            content,
            json.dumps(sources) if sources else None,
            json.dumps(tool_calls) if tool_calls else None,
        )
        # Update chat's updated_at timestamp
        await conn.execute(
            "UPDATE chats SET updated_at = now() WHERE id = $1",
            chat_id,
        )


async def _generate_chat_title(user_message: str) -> str:
    """Generate a short title for the chat based on the first user message."""
    if not settings.llm_api_key:
        return "New Chat"

    try:
        llm = ChatLiteLLM(
            model=settings.llm_provider,
            api_key=settings.llm_api_key,
            temperature=0.3,
            max_tokens=256,  # Generous limit to ensure full title
        )

        prompt = f"""Generate a concise 3-6 word title for a conversation that starts with this question. 
Return ONLY the title text, no quotes, no punctuation at the end, no explanation.

Question: {user_message[:500]}

Title:"""

        response = await llm.ainvoke(prompt)
        title = response.content.strip().strip('"\'').strip()
        # Remove any trailing punctuation
        title = title.rstrip('.,!?:;')
        # Truncate if too long
        if len(title) > 100:
            title = title[:97] + "..."
        logger.info("Generated chat title: %s", title)
        return title if title else "New Chat"
    except Exception as e:
        logger.warning("Failed to generate title: %s", e)
        return "New Chat"


async def _update_chat_title(chat_id: UUID, title: str) -> None:
    """Update the chat's title."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE chats SET title = $1, updated_at = now() WHERE id = $2",
            title,
            chat_id,
        )


async def _is_first_message(chat_id: UUID) -> bool:
    """Check if this is the first message in the chat."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM chat_messages WHERE chat_id = $1",
            chat_id,
        )
    return count == 0


@router.post("/stream")
async def chat_stream(
    data: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    if len(data.message) > settings.max_message_length:
        raise HTTPException(
            status_code=400,
            detail=f"Message too long (max {settings.max_message_length} chars)",
        )

    agent = get_agent()
    if agent is None:
        raise HTTPException(
            status_code=503,
            detail="Agent not available — LLM_API_KEY not configured",
        )

    user_id = int(current_user["sub"])
    chat_id = data.chat_id
    is_new_chat = chat_id is None

    # Create new chat if needed
    if is_new_chat:
        chat_id = await _create_chat(user_id)

    # Load chat history for context
    history = []
    is_first = True
    if not is_new_chat:
        history = await _get_chat_history(chat_id, user_id)
        is_first = len(history) == 0

    # Use chat_id as thread_id for LangGraph memory
    thread_id = str(chat_id)

    async def event_generator():
        nonlocal is_first

        collected_tool_outputs: list[str] = []
        collected_tool_calls: list[dict] = []
        full_response = ""
        final_sources: list[dict] = []

        try:
            # Send chat_id first if this is a new chat
            if is_new_chat:
                yield {
                    "event": "chat_id",
                    "data": json.dumps({"chat_id": str(chat_id)}),
                }

            # Send immediate thinking indicator so user knows we're processing
            yield {
                "event": "thinking",
                "data": json.dumps({"status": "started"}),
            }

            # Build messages with history
            messages = [{"role": m["role"], "content": m["content"]} for m in history]
            messages.append({"role": "user", "content": data.message})

            async for chunk in agent.astream(
                {"messages": messages},
                config={"configurable": {"thread_id": thread_id}},
                stream_mode="updates",
            ):
                for node_name, node_output in chunk.items():
                    msgs = node_output.get("messages", [])
                    for msg in msgs:
                        if hasattr(msg, "tool_calls") and msg.tool_calls:
                            for tc in msg.tool_calls:
                                tool_data = {
                                    "tool": tc.get("name", "unknown"),
                                    "input": _safe_serialize(tc.get("args", {})),
                                }
                                collected_tool_calls.append(tool_data)
                                yield {
                                    "event": "tool_start",
                                    "data": json.dumps(tool_data),
                                }

                        elif msg.type == "tool":
                            tool_content = str(msg.content)
                            tool_name = getattr(msg, "name", "unknown")

                            if tool_name in ("search_documents", "get_project_details"):
                                collected_tool_outputs.append(tool_content)

                            # Extract a more useful summary for display
                            # Remove the SOURCES_MARKER section for cleaner output
                            display_content = tool_content
                            if SOURCES_MARKER in display_content:
                                display_content = display_content[:display_content.index(SOURCES_MARKER)].strip()

                            yield {
                                "event": "tool_end",
                                "data": json.dumps({
                                    "tool": tool_name,
                                    "output": display_content[:1500],  # Send more content
                                    "output_summary": display_content[:200],
                                }),
                            }

                        elif msg.type == "ai" and msg.content and not getattr(msg, "tool_calls", None):
                            content = msg.content
                            full_response += content
                            chunk_size = 6
                            for i in range(0, len(content), chunk_size):
                                yield {
                                    "event": "token",
                                    "data": json.dumps({"content": content[i : i + chunk_size]}),
                                }

            # Extract and send sources
            if collected_tool_outputs:
                all_sources = []
                for output in collected_tool_outputs:
                    all_sources.extend(_extract_sources_from_tool_output(output))

                if all_sources:
                    unique_sources = []
                    seen_ids = set()
                    for s in all_sources:
                        doc_id = s.get("document_id")
                        if doc_id and doc_id not in seen_ids:
                            seen_ids.add(doc_id)
                            unique_sources.append(s)

                    final_sources = unique_sources[:5]
                    if final_sources:
                        yield {
                            "event": "sources",
                            "data": json.dumps(final_sources),
                        }

            # Generate and send title for first message
            if is_first and is_new_chat:
                title = await _generate_chat_title(data.message)
                await _update_chat_title(chat_id, title)
                yield {
                    "event": "chat_title",
                    "data": json.dumps({"title": title}),
                }

            # Persist messages to database
            await _save_message(chat_id, "user", data.message)
            await _save_message(
                chat_id,
                "assistant",
                full_response,
                sources=final_sources if final_sources else None,
                tool_calls=collected_tool_calls if collected_tool_calls else None,
            )

            yield {"event": "done", "data": ""}

        except Exception as e:
            logger.exception("Stream error: %s", e)
            yield {
                "event": "error",
                "data": json.dumps({
                    "message": str(e)[:200],
                    "retryable": True,
                }),
            }

    return EventSourceResponse(event_generator())


def _safe_serialize(obj) -> dict:
    """Safely serialize tool input for SSE, handling non-JSON types."""
    if isinstance(obj, dict):
        return {
            k: str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v
            for k, v in obj.items()
        }
    return {"raw": str(obj)}
