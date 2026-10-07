"""Heuristic (non-LLM) memory extraction from chat messages.

Design: a sentence becomes a memory only if it positively matches a
first-person pattern (preference / project / goal / fact). Everything else
(questions, requests, code, pasted logs, secrets, small talk) is dropped.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from app.services.message_adapter import normalize_messages
from app.services.memory_text import SHORT_TECH_TERMS, STOPWORDS, TOKEN_RE, tokens

MIN_SENTENCE_LEN = 12
MAX_SENTENCE_LEN = 300
MAX_TITLE_LEN = 80
MAX_TAGS = 6

# --------------------------------------------------------------------------- #
# Text normalisation / sentence splitting
# --------------------------------------------------------------------------- #
_FENCED_CODE_RE = re.compile(r"```.*?(?:```|\Z)", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`([^`\n]*)`")
_ABBREV_RE = re.compile(r"\b(?:e\.g|i\.e|etc|vs|dr|mr|mrs|ms|prof|approx|cf)\.", re.IGNORECASE)
_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+")
_CLAUSE_SPLIT_RE = re.compile(r"\s*(?:;|\b(?:and|but)\s+(?=(?:i|i'm|i've|i'd|we|we're|we've)\b))\s*", re.I)
_BULLET_RE = re.compile(r"^\s*(?:[-*\u2022]+|\d+[.)])\s+")
_LEADING_FILLER_RE = re.compile(
    r"^(?:hi|hello|hey|thanks|thank you|thx|ok|okay|so|well|also|and|but|btw|anyway|actually)\b[\s,!.:;-]*",
    re.IGNORECASE,
)
_PLACEHOLDER = "\x00"


def _normalize(text: str) -> str:
    text = (
        text.replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )
    text = _FENCED_CODE_RE.sub(" \n ", text)
    text = _INLINE_CODE_RE.sub(r"\1", text)
    return text


def _split_sentences(text: str) -> list[str]:
    protected = _ABBREV_RE.sub(lambda m: m.group().replace(".", _PLACEHOLDER), text.strip())
    parts = _SPLIT_RE.split(protected)
    return [p.replace(_PLACEHOLDER, ".").strip() for p in parts if p and p.strip()]


def _split_clauses(sentence: str) -> list[str]:
    return [p.strip(" ,") for p in _CLAUSE_SPLIT_RE.split(sentence) if p and p.strip(" ,")]


def _clean_sentence(sentence: str) -> str | None:
    s = _BULLET_RE.sub("", sentence)
    s = re.sub(r"\s+", " ", s).strip()
    while True:  # "Hi, thanks! So I am building..." -> "I am building..."
        stripped = _LEADING_FILLER_RE.sub("", s, count=1).strip()
        if stripped == s:
            break
        s = stripped
    if not (MIN_SENTENCE_LEN <= len(s) <= MAX_SENTENCE_LEN):
        return None
    return s


# --------------------------------------------------------------------------- #
# Rejection filters
# --------------------------------------------------------------------------- #
_REQUEST_RE = re.compile(
    r"^(?:(?:can|could|would|will)\s+you\b|(?:please\s+)?(?:help me|tell me|explain|teach me|show me|summari[sz]e|write me)\b)",
    re.IGNORECASE,
)

_CODE_RE = re.compile(
    r"[{};]|=>|->|</?\w+>|\(\)|\[\]|::|\bdef \w+\(|\bimport \w+|\bconsole\.|"
    r"^(?:\$|>>>|#include|Traceback|File \".*\", line \d+|\w*Error:)"
)

_SECRET_RES = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"),                       # OpenAI / Anthropic style
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),                  # GitHub tokens
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),                          # AWS access key id
    re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),                # Slack
    re.compile(r"\bAIza[0-9A-Za-z_-]{30,}"),                      # Google API key
    re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\."),  # JWT
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\b(?:password|passwd|pwd|passcode|secret|token|api[_ -]?key|private[_ -]?key)\b\s*(?:is|=|:)\s*\S+", re.I),
    re.compile(r"\b(?:\d[ -]?){13,16}\b"),                        # card-like numbers
]
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_HIGH_ENTROPY_RE = re.compile(r"[A-Za-z0-9+/_=-]{24,}")


def _looks_like_code(sentence: str) -> bool:
    if _CODE_RE.search(sentence):
        return True
    allowed = set(".,'\"!?-:()")
    symbols = sum(1 for c in sentence if not (c.isalnum() or c.isspace() or c in allowed))
    return symbols / max(len(sentence), 1) > 0.15


def _contains_secret(sentence: str) -> bool:
    if any(rx.search(sentence) for rx in _SECRET_RES):
        return True
    for token in _HIGH_ENTROPY_RE.findall(sentence):
        if re.search(r"\d", token) and re.search(r"[A-Za-z]", token):
            return True
    return False


def _redact_pii(sentence: str) -> str:
    return _EMAIL_RE.sub("[email]", sentence)


# --------------------------------------------------------------------------- #
# Classification: (type, base confidence). Order matters: most specific first.
# --------------------------------------------------------------------------- #
_BE = r"(?:i am|i'm|we are|we're)"
_I_AM = r"(?:i am|i'm)"

_PATTERNS: list[tuple[str, float, list[re.Pattern[str]]]] = [
    (
        "project",
        0.80,
        [
            re.compile(rf"\b{_BE}\s+(?:currently\s+|now\s+|still\s+)?(?:building|developing|creating|making|designing|working on)\b", re.I),
            re.compile(r"\b(?:i|we)(?:'ve| have)\s+(?:been\s+)?(?:building|developing|working on)\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:built|made|developed)\s+(?:a|an|my|our)\b", re.I),
            re.compile(r"\b(?:my|our)\s+(?:current\s+|side\s+)?(?:project|product|app|startup|company|thesis)\s+(?:is|are|called|named)\b", re.I),
        ],
    ),
    (
        "goal",
        0.72,
        [
            re.compile(r"\b(?:i|we)\s+(?:really\s+)?(?:want|need|plan|hope|intend|aim|wish)\s+to\s+(?!(?:know|ask|see|check|confirm|find out)\b)", re.I),
            re.compile(r"\b(?:i|we)(?:'d| would)\s+rather\s+(?:learn|build|finish|study|work|make|create)\b", re.I),
            re.compile(rf"\b{_BE}\s+(?:planning|going|trying|aiming|hoping|looking)\s+to\b", re.I),
            re.compile(rf"\b{_BE}\s+(?:preparing|studying|training|aiming)\s+for\b", re.I),
            re.compile(r"\b(?:my|our)\s+goal\s+is\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:have to|must)\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:decided|chose|plan)\s+to\s+", re.I),
        ],
    ),
    (
        "instruction_preference",
        0.88,
        [
            re.compile(r"^(?:please\s+)?(?:always|never|use|avoid|keep|answer|explain|write|respond|do not|don't)\b", re.I),
        ],
    ),
    (
        "preference",
        0.85,
        [
            re.compile(r"\b(?:i|we)\s+(?:(?:really|usually|always|generally|mostly|personally|probably|definitely|mainly|still|now)\s+)?(?:prefer|like|love|enjoy|hate|dislike|avoid)\b", re.I),
            re.compile(r"\b(?:i|we)(?:'d| would)\s+rather\s+(?:use|avoid|write|work with|choose)\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:tend to|mostly use|switched to|no longer use|am into|'m into|are into|'re into)\b", re.I),
            re.compile(rf"\b{_BE}\s+into\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:don't|do not|never|rarely)\s+(?:like|want|use|enjoy)\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:always|usually|never)\s+\w+", re.I),
            re.compile(r"\bmy\s+(?:favou?rite|preferred)\b", re.I),
            re.compile(r"^(?:please\s+)?(?:use|avoid|keep|answer|explain|write|respond)\b", re.I),
        ],
    ),
    (
        "fact",
        0.65,
        [
            re.compile(r"\bmy name is\b", re.I),
            re.compile(rf"\b{_I_AM}\s+(?:an?\s+(?!bit\b|little\b|lot\b|few\b)\w+|from\b|based in\b|studying\b|learning\b|majoring\b|new to\b)", re.I),
            re.compile(r"\b(?:i|we)(?:'ve| have)\s+(?:been\s+)?(?:learning|studying|using|working with)\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:am|'m|are|'re)\s+learning\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:work|study|live|code|write|develop)\s+(?:as|at|in|on|with|for)\b", re.I),
            re.compile(rf"\b(?:(?:i|we)\s+use|{_BE}\s+using)\b", re.I),
            re.compile(r"\b(?:my|our)\s+(?:team|stack|backend|frontend|database|college|university|campus|major|role|job)\s+(?:is|uses|are)\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:work|study)\s+(?:at|for)\b", re.I),
            re.compile(r"\b(?:we(?:'re| are)|i(?:'m| am))\s+(?:on|using)\s+[A-Z][\w.+#-]*", re.I),
            re.compile(r"\b(?:final year|based in|located in|speak|fluent in|languages?\s+(?:i|we)\s+know)\b", re.I),
            re.compile(r"\b(?:exam|deadline|interview|launch|submission)\s+(?:is\s+)?(?:on|by|this|next)\b", re.I),
            re.compile(r"\b(?:i(?:'m| am)|we(?:'re| are))\s+stuck\s+on\b", re.I),
            re.compile(r"\b(?:remember|note)\s+that\b|\bfor future reference\b", re.I),
        ],
    ),
]

# "I need to fix this bug" is a task about the current chat, not a durable goal.
_TASK_REF_RE = re.compile(
    r"\b(?:(?:this|that|these|those|above|below|following)\s+(?:\w+\s+){0,3}?(?:error|bug|code|file|function|snippet|output|traceback|issue|page|component)|(?:code|file|function|snippet|output|traceback)\s+(?:above|below))\b",
    re.I,
)

_HEDGE_RE = re.compile(r"\b(?:maybe|might|perhaps|probably|not sure|i think|i guess|kind of|sort of)\b", re.I)
_EXPLICIT_RE = re.compile(r"\b(?:always|never|definitely|no longer|switched to|my name is)\b", re.I)
_WEAK_FIRST_PERSON_RE = re.compile(r"\b(?:we|our)\b", re.I)
_STRONG_FIRST_PERSON_RE = re.compile(r"\b(?:i|i'm|i've|i'd|my)\b", re.I)


def _classify(text: str) -> tuple[str, float] | None:
    """Return (memory_type, confidence), or None if the sentence isn't memory-worthy."""
    for memory_type, confidence, patterns in _PATTERNS:
        if any(p.search(text) for p in patterns):
            if memory_type == "goal" and _TASK_REF_RE.search(text):
                return None
            if _HEDGE_RE.search(text):
                confidence -= 0.15
            if _EXPLICIT_RE.search(text):
                confidence += 0.05
            if _STRONG_FIRST_PERSON_RE.search(text):
                confidence += 0.03
            elif _WEAK_FIRST_PERSON_RE.search(text):
                confidence += 0.01
            words = len(tokens(text, include_stopwords=True))
            if words < 4:
                confidence -= 0.08
            elif words > 24:
                confidence -= 0.04
            confidence = max(0.35, min(0.98, confidence))
            return memory_type, round(confidence, 2)
    return None


# --------------------------------------------------------------------------- #
# Tags / title
# --------------------------------------------------------------------------- #
def _extract_tags(text: str, max_tags: int = MAX_TAGS) -> list[str]:
    """Pick up to max_tags keywords; names/tech terms (FastAPI, Node.js, C++) rank first."""
    candidates: list[tuple[int, int, str]] = []
    seen: set[str] = set()
    for idx, match in enumerate(TOKEN_RE.finditer(text)):
        raw = match.group().rstrip("./-_")
        word = raw.lower()
        if not word or word in seen or word in STOPWORDS or word.isdigit():
            continue
        if len(word) < 3 and word not in SHORT_TECH_TERMS:
            continue
        seen.add(word)
        distinctive = idx > 0 and (
            any(c.isupper() for c in raw) or any(c in "+#./" or c.isdigit() for c in raw)
        )
        candidates.append((0 if distinctive else 1, len(candidates), word))
    candidates.sort()
    return [word for _, _, word in candidates[:max_tags]]


def _make_title(text: str, max_len: int = MAX_TITLE_LEN) -> str:
    if len(text) <= max_len:
        return text
    cut = text[: max_len - 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:-") + "\u2026"


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def _build_memory_record(sentence: str, metadata: dict | None = None) -> dict | None:
    cleaned = _clean_sentence(sentence)
    if cleaned is None:
        return None
    if cleaned.endswith("?") or _REQUEST_RE.match(cleaned):
        return None
    if _looks_like_code(cleaned) or _contains_secret(cleaned):
        return None
    cleaned = _redact_pii(cleaned)

    classified = _classify(cleaned)
    if classified is None:
        return None
    memory_type, confidence = classified

    metadata = metadata or {}
    extracted_at = metadata.get("extracted_at") or datetime.now(timezone.utc).isoformat()
    record = {
        "memory_type": memory_type,
        "title": _make_title(cleaned),
        "content": cleaned,
        "tags": _extract_tags(cleaned),
        "source": "chat",
        "source_url": metadata.get("conversation_url"),
        "confidence": confidence,
        "needs_review": confidence < 0.6,
        "platform": metadata.get("platform"),
        "conversation_url": metadata.get("conversation_url"),
        "message_index": metadata.get("message_index"),
        "extracted_at": extracted_at,
        "sources": [{
            "platform": metadata.get("platform"),
            "conversation_url": metadata.get("conversation_url"),
            "message_index": metadata.get("message_index"),
            "extracted_at": extracted_at,
        }],
    }
    return record


def _similarity(a: dict, b: dict) -> float:
    left = set(tokens(str(a.get("content") or "")))
    right = set(tokens(str(b.get("content") or "")))
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def _is_superseding(new: dict, old: dict) -> bool:
    new_tokens = set(tokens(str(new.get("content") or "")))
    old_tokens = set(tokens(str(old.get("content") or "")))
    if not new_tokens or not old_tokens:
        return False
    overlap = len(new_tokens & old_tokens) / max(1, min(len(new_tokens), len(old_tokens)))
    content = str(new.get("content") or "").lower()
    has_update_marker = bool(re.search(r"\b(?:now|switched to|no longer|instead|rather)\b", content))
    if overlap >= 0.35 and (has_update_marker or "prefer" in content):
        return True
    old_content = str(old.get("content") or "").lower()
    return bool(new.get("memory_type") == "preference" and has_update_marker and "prefer" in content and "prefer" in old_content)


def find_superseded(new: dict, existing: list[dict]) -> list[tuple[dict, dict]]:
    """Return (new, old) pairs where a new memory appears to replace an older one."""
    pairs: list[tuple[dict, dict]] = []
    for old in existing:
        if not isinstance(old, dict):
            continue
        if old.get("memory_type") != new.get("memory_type"):
            continue
        if _is_superseding(new, old):
            pairs.append((new, old))
    return pairs


def _message_text(message: dict) -> str:
    value = message.get("text")
    return value.strip() if isinstance(value, str) else ""


def _rejection_reason(sentence: str) -> str | None:
    cleaned = _clean_sentence(sentence)
    if cleaned is None:
        raw = re.sub(r"\s+", " ", sentence).strip()
        return "too_short" if len(raw) < MIN_SENTENCE_LEN else "too_long"
    if cleaned.endswith("?"):
        return "question"
    if _REQUEST_RE.match(cleaned):
        return "request"
    if _looks_like_code(cleaned):
        return "code_like"
    if _contains_secret(cleaned):
        return "secret"
    if _TASK_REF_RE.search(cleaned):
        return "task_reference"
    if _classify(cleaned) is None:
        return "no_pattern"
    return None


def _empty_report() -> dict:
    return {
        "messages_seen": 0,
        "user_messages": 0,
        "empty_text_skips": 0,
        "sentences_examined": 0,
        "accepted": 0,
        "rejections": {
            "too_short": 0,
            "too_long": 0,
            "question": 0,
            "request": 0,
            "code_like": 0,
            "secret": 0,
            "no_pattern": 0,
            "task_reference": 0,
        },
    }


def _conversation_topic(messages: list[dict], title: str | None, metadata: dict) -> dict | None:
    words: list[str] = []
    for message in messages:
        if message.get("role") != "user":
            continue
        words.extend(_extract_tags(_message_text(message), max_tags=12))
    safe_title = _redact_pii(title) if isinstance(title, str) else title
    if safe_title:
        words.extend(_extract_tags(safe_title, max_tags=6))
    unique = list(dict.fromkeys(words))[:8]
    if not unique:
        return None
    label = safe_title.strip() if isinstance(safe_title, str) and safe_title.strip() else ", ".join(unique[:5])
    content = _redact_pii(f"Conversation topic: {label} ({', '.join(unique)}).")
    return {
        "memory_type": "conversation_topic",
        "title": _make_title(label),
        "content": content,
        "tags": unique[:MAX_TAGS],
        "source": "chat",
        "source_url": metadata.get("conversation_url"),
        "confidence": 0.55,
        "needs_review": True,
        "platform": metadata.get("platform"),
        "conversation_url": metadata.get("conversation_url"),
        "message_index": None,
        "extracted_at": metadata.get("extracted_at") or datetime.now(timezone.utc).isoformat(),
        "sources": [{**metadata, "message_index": None}],
    }


def extract_with_report(
    messages: list,
    limit: int | None = None,
    *,
    platform: str | None = None,
    conversation_url: str | None = None,
    title: str | None = None,
    include_topic: bool = False,
) -> tuple[list[dict], dict]:
    """Extract memories and explain every examined sentence's outcome."""
    # Keep the historical public extractor behavior for bare non-dict values;
    # the route and adapter handle platform-specific string captures explicitly.
    normalized = normalize_messages(
        [message for message in messages if isinstance(message, dict)] if isinstance(messages, list) else messages,
        platform=platform,
    )
    report = _empty_report()
    report["messages_seen"] = len(messages) if isinstance(messages, list) else 0
    raw_user_messages = 0
    if isinstance(messages, list):
        for raw in messages:
            if not isinstance(raw, dict):
                continue
            raw_role = str(raw.get("role", raw.get("sender", raw.get("author", "")))).lower().replace("-", "_")
            if raw_role in {"user", "human", "you", "me", "prompt", "customer"}:
                raw_user_messages += 1
                if not normalize_messages([raw], platform=platform):
                    report["empty_text_skips"] += 1
    report["user_messages"] = raw_user_messages
    extracted: list[dict] = []
    seen: set[str] = set()

    for message_index, message in enumerate(normalized):
        if message.get("role") != "user":
            continue
        text = _message_text(message)
        if not text:
            continue

        for sentence in _split_sentences(_normalize(text)):
            for clause in _split_clauses(sentence):
                report["sentences_examined"] += 1
                reason = _rejection_reason(clause)
                if reason:
                    report["rejections"][reason] += 1
                    continue
                metadata = {
                    "platform": message.get("platform"),
                    "conversation_url": message.get("conversation_url"),
                    "message_index": message_index,
                }
                memory = _build_memory_record(clause, metadata)
                if memory is None:
                    report["rejections"]["no_pattern"] += 1
                    continue
                report["accepted"] += 1
                duplicate_at = next((i for i, old in enumerate(extracted) if _similarity(memory, old) >= 0.8), None)
                if duplicate_at is not None:
                    merged_sources = extracted[duplicate_at].get("sources", []) + memory.get("sources", [])
                    if memory["confidence"] > extracted[duplicate_at]["confidence"]:
                        extracted[duplicate_at] = memory
                    extracted[duplicate_at]["sources"] = merged_sources
                    continue
                key = re.sub(r"[\s.!]+$", "", memory["content"].lower())
                if key in seen:
                    continue
                seen.add(key)
                extracted.append(memory)

    extracted.sort(key=lambda m: -m["confidence"])  # stable: ties keep conversation order
    if include_topic:
        topic = _conversation_topic(
            normalized,
            title,
            {"platform": platform, "conversation_url": conversation_url, "extracted_at": datetime.now(timezone.utc).isoformat()},
        )
        if topic:
            extracted.append(topic)
    return (extracted[:limit] if limit else extracted), report


def extract_memories_from_messages(messages: list, limit: int | None = None) -> list[dict]:
    """Compatibility API returning only extracted memory records."""
    memories, _ = extract_with_report(messages, limit=limit)
    return memories
