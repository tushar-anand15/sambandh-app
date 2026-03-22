"""
LangChain agent with LiteLLM for multi-provider LLM support.

Uses LangGraph's create_react_agent with InMemorySaver for conversation memory.
"""

from __future__ import annotations

import logging

from langchain_litellm import ChatLiteLLM
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent

from .agent_tools import ALL_TOOLS
from .config import settings
from .prompts import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

_agent = None


def get_agent():
    global _agent
    if _agent is not None:
        return _agent

    if not settings.llm_api_key:
        logger.warning("LLM_API_KEY not set — agent will not be available")
        return None

    logger.info("Creating agent with model: %s", settings.llm_provider)

    llm = ChatLiteLLM(
        model=settings.llm_provider,
        api_key=settings.llm_api_key,
        temperature=0.1,
        max_tokens=2048,
    )

    _agent = create_react_agent(
        llm,
        tools=ALL_TOOLS,
        checkpointer=MemorySaver(),
        prompt=SYSTEM_PROMPT,
    )

    logger.info("Agent created with %d tools", len(ALL_TOOLS))
    return _agent


def reset_agent():
    """Reset the agent (useful for testing or config changes)."""
    global _agent
    _agent = None
