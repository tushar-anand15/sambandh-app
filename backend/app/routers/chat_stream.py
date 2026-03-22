"""
SSE streaming chat endpoint using the LangChain agent.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from ..agent import get_agent
from ..agent_tools import SOURCES_MARKER
from ..auth import get_current_user
from ..config import settings
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

    thread_id = f"user-{current_user.get('sub', current_user.get('id', 'anon'))}"

    async def event_generator():
        collected_tool_outputs: list[str] = []
        
        try:
            async for chunk in agent.astream(
                {"messages": [{"role": "user", "content": data.message}]},
                config={"configurable": {"thread_id": thread_id}},
                stream_mode="updates",
            ):
                for node_name, node_output in chunk.items():
                    messages = node_output.get("messages", [])
                    for msg in messages:
                        if hasattr(msg, "tool_calls") and msg.tool_calls:
                            for tc in msg.tool_calls:
                                yield {
                                    "event": "tool_start",
                                    "data": json.dumps({
                                        "tool": tc.get("name", "unknown"),
                                        "input": _safe_serialize(tc.get("args", {})),
                                    }),
                                }

                        elif msg.type == "tool":
                            tool_content = str(msg.content)
                            tool_name = getattr(msg, "name", "unknown")
                            
                            if tool_name in ("search_documents", "get_project_details"):
                                collected_tool_outputs.append(tool_content)
                            
                            yield {
                                "event": "tool_end",
                                "data": json.dumps({
                                    "tool": tool_name,
                                    "output_summary": tool_content[:200],
                                }),
                            }

                        elif msg.type == "ai" and msg.content and not getattr(msg, "tool_calls", None):
                            content = msg.content
                            chunk_size = 6
                            for i in range(0, len(content), chunk_size):
                                yield {
                                    "event": "token",
                                    "data": json.dumps({"content": content[i:i + chunk_size]}),
                                }

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
                    
                    if unique_sources:
                        yield {
                            "event": "sources",
                            "data": json.dumps(unique_sources[:5]),
                        }

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
        return {k: str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v
                for k, v in obj.items()}
    return {"raw": str(obj)}
