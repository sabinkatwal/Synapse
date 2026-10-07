"""Normalize chat messages from the supported platform capture shapes."""
from __future__ import annotations

from html import unescape
import re
from typing import Any


_USER_ROLES = {"user", "human", "you", "me", "prompt", "customer"}
_ASSISTANT_ROLES = {"assistant", "model", "bot", "ai", "chatgpt", "claude", "gemini"}
_TAG_RE = re.compile(r"<[^>]*>")


def _text(value: Any, depth: int = 0) -> str:
    if depth > 8 or value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(part for item in value if (part := _text(item, depth + 1)))
    if isinstance(value, dict):
        for key in ("text", "content", "parts", "message"):
            if key in value:
                result = _text(value[key], depth + 1)
                if result:
                    return result
    return ""


def _clean_text(value: Any) -> str:
    text = _text(value)
    text = unescape(_TAG_RE.sub(" ", text))
    return re.sub(r"\s+", " ", text).strip()


def _role(value: Any) -> str | None:
    role = str(value or "").strip().lower().replace("-", "_")
    if role in _USER_ROLES:
        return "user"
    if role in _ASSISTANT_ROLES:
        return "assistant"
    return None


def normalize_messages(raw: Any, platform: str | None = None) -> list[dict]:
    """Return safe, common message records; malformed items are skipped."""
    if not isinstance(raw, list):
        return []
    normalized: list[dict] = []
    for item in raw:
        if isinstance(item, str):
            role = "user"
            text = _clean_text(item)
            item = {}
        elif isinstance(item, dict):
            role = _role(item.get("role", item.get("sender", item.get("author"))))
            text = _clean_text(item.get("text", item.get("content", item.get("parts", item.get("message")))))
        else:
            continue
        if role is None:
            continue
        if not text:
            continue
        normalized.append(
            {
                "role": role,
                "text": text,
                "platform": platform or item.get("platform"),
                "conversation_url": item.get("conversation_url") or item.get("url") or item.get("source_url"),
                "timestamp": item.get("timestamp") or item.get("created_at") or item.get("createdAt"),
            }
        )
    return normalized