import math
import re
from datetime import datetime, timezone
from typing import Any


def _normalize_words(text: str) -> set[str]:
    return {word.lower() for word in re.findall(r"[a-zA-Z0-9_-]+", text) if len(word) > 2}


def _recency_score(created_at: datetime | None) -> float:
    if created_at is None:
        return 0.0

    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    age_days = max(0.0, (datetime.now(timezone.utc) - created_at).total_seconds() / 86400)
    return math.exp(-age_days / 30)


def _memory_score(memory: Any, query_words: set[str], query: str) -> float:
    haystack = f"{memory.title or ''} {memory.content} {' '.join(memory.tags or [])} {memory.memory_type}"
    memory_words = _normalize_words(haystack)
    overlap = len(query_words & memory_words)
    exact_match = 1.0 if query.lower() in haystack.lower() else 0.0
    confidence = float(memory.confidence or 0.0)
    recency = _recency_score(memory.created_at)
    return overlap * 2.0 + exact_match * 2.0 + confidence + recency


def rank_memories(memories: list[Any], query: str, limit: int = 5) -> list[Any]:
    query = query.strip()
    if not query:
        return sorted(
            memories,
            key=lambda memory: (memory.created_at or datetime.min, memory.confidence or 0.0),
            reverse=True,
        )[: max(1, limit)]

    query_words = _normalize_words(query)
    scored = [
        (_memory_score(memory, query_words, query), index, memory)
        for index, memory in enumerate(memories)
    ]
    scored = [item for item in scored if item[0] > 0]
    scored.sort(key=lambda item: (item[0], -item[1]), reverse=True)
    return [memory for _, _, memory in scored[: max(1, limit)]]


def build_memory_context(memories: list[Any]) -> str:
    if not memories:
        return ""

    lines = ["Relevant user memories:"]
    for memory in memories:
        label = memory.title or memory.memory_type.title()
        lines.append(f"- [{memory.memory_type}] {label}: {memory.content}")
    return "\n".join(lines)
