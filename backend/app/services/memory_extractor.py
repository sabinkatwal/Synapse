"""Heuristic (non-LLM) memory extraction from chat messages.

Design: a sentence becomes a memory only if it positively matches a
first-person pattern (preference / project / goal / fact). Everything else
(questions, requests, code, pasted logs, secrets, small talk) is dropped.
"""
from __future__ import annotations

import re

MIN_SENTENCE_LEN = 12
MAX_SENTENCE_LEN = 300
MAX_TITLE_LEN = 80
MAX_TAGS = 6

# --------------------------------------------------------------------------- #
# Tag vocabulary
# --------------------------------------------------------------------------- #
_BASE_STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "as", "at",
    "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can", "did", "do",
    "does", "doing", "don", "down", "during", "each", "few", "for", "from", "further", "had", "has", "have",
    "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how", "i", "if", "in", "into",
    "is", "it", "its", "itself", "just", "me", "more", "most", "my", "myself", "no", "nor", "not", "of", "off",
    "on", "once", "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own", "same", "she", "should",
    "so", "some", "such", "t", "than", "that", "the", "their", "theirs", "them", "themselves", "then", "there",
    "these", "they", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were",
    "what", "when", "where", "which", "while", "who", "whom", "why", "will", "with", "you", "your", "yours",
    "yourselves",
}
_FILLER_STOPWORDS = {
    "want", "need", "like", "love", "hate", "enjoy", "prefer", "also", "would", "could", "using", "use", "used",
    "get", "make", "build", "building", "working", "work", "currently", "really", "always", "usually", "never",
    "plan", "going", "try", "trying", "let", "something", "thing", "things", "much", "many", "well", "good",
    "new", "one", "lot", "bit", "little", "etc", "e.g", "i.e", "name", "called", "named", "know", "think",
    "maybe", "probably", "still", "now", "right", "app", "project",
}
STOPWORDS = _BASE_STOPWORDS | _FILLER_STOPWORDS

# Two-letter terms that are meaningful as tags (everything else needs 3+ chars).
SHORT_TECH_TERMS = {"ai", "ml", "ui", "ux", "go", "db", "js", "ts", "qa", "ci", "cd", "vm", "os", "c#", "c++", "r"}

# --------------------------------------------------------------------------- #
# Text normalisation / sentence splitting
# --------------------------------------------------------------------------- #
_FENCED_CODE_RE = re.compile(r"```.*?(?:```|\Z)", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`([^`\n]*)`")
_ABBREV_RE = re.compile(r"\b(?:e\.g|i\.e|etc|vs|dr|mr|mrs|ms|prof|approx|cf)\.", re.IGNORECASE)
_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+")
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
    re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),                      # emails (PII); remove if you want these stored
]
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
            re.compile(rf"\b{_BE}\s+(?:planning|going|trying|aiming|hoping|looking)\s+to\b", re.I),
            re.compile(rf"\b{_BE}\s+(?:preparing|studying|training|aiming)\s+for\b", re.I),
            re.compile(r"\b(?:my|our)\s+goal\s+is\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:have to|must)\b", re.I),
        ],
    ),
    (
        "preference",
        0.85,
        [
            re.compile(r"\b(?:i|we)\s+(?:(?:really|usually|always|generally|mostly|personally|probably|definitely|mainly|still)\s+)?(?:prefer|like|love|enjoy|hate|dislike|avoid)\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:don't|do not|never|rarely)\s+(?:like|want|use|enjoy)\b", re.I),
            re.compile(r"\b(?:i|we)\s+(?:always|usually|never)\s+\w+", re.I),
            re.compile(r"\bmy\s+(?:favou?rite|preferred)\b", re.I),
            re.compile(r"^(?:please\s+)?(?:always|never)\s+\w+", re.I),
        ],
    ),
    (
        "fact",
        0.65,
        [
            re.compile(r"\bmy name is\b", re.I),
            re.compile(rf"\b{_I_AM}\s+(?:an?\s+(?!bit\b|little\b|lot\b|few\b)\w+|from\b|based in\b|studying\b|learning\b|majoring\b|new to\b)", re.I),
            re.compile(r"\b(?:i|we)\s+(?:work|study|live|code|write|develop)\s+(?:as|at|in|on|with|for)\b", re.I),
            re.compile(rf"\b(?:(?:i|we)\s+use|{_BE}\s+using)\b", re.I),
            re.compile(r"\b(?:my|our)\s+(?:team|stack|backend|frontend|database|college|university|campus|major|role|job)\s+(?:is|uses|are)\b", re.I),
        ],
    ),
]

# "I need to fix this bug" is a task about the current chat, not a durable goal.
_TASK_REF_RE = re.compile(
    r"\b(?:this|that|these|those|above|below|following|error|bug|code|file|function|snippet|output|traceback)\b",
    re.I,
)

_HEDGE_RE = re.compile(r"\b(?:maybe|might|perhaps|probably|not sure|i think|i guess|kind of|sort of)\b", re.I)


def _classify(text: str) -> tuple[str, float] | None:
    """Return (memory_type, confidence), or None if the sentence isn't memory-worthy."""
    for memory_type, confidence, patterns in _PATTERNS:
        if any(p.search(text) for p in patterns):
            if memory_type == "goal" and _TASK_REF_RE.search(text):
                return None
            if _HEDGE_RE.search(text):
                confidence -= 0.15
            return memory_type, round(confidence, 2)
    return None


# --------------------------------------------------------------------------- #
# Tags / title
# --------------------------------------------------------------------------- #
_WORD_RE = re.compile(r"[^\W_][\w+#./-]*", re.UNICODE)


def _extract_tags(text: str, max_tags: int = MAX_TAGS) -> list[str]:
    """Pick up to max_tags keywords; names/tech terms (FastAPI, Node.js, C++) rank first."""
    candidates: list[tuple[int, int, str]] = []
    seen: set[str] = set()
    for idx, match in enumerate(_WORD_RE.finditer(text)):
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
def _build_memory_record(sentence: str) -> dict | None:
    cleaned = _clean_sentence(sentence)
    if cleaned is None:
        return None
    if cleaned.endswith("?") or _REQUEST_RE.match(cleaned):
        return None
    if _looks_like_code(cleaned) or _contains_secret(cleaned):
        return None

    classified = _classify(cleaned)
    if classified is None:
        return None
    memory_type, confidence = classified

    return {
        "memory_type": memory_type,
        "title": _make_title(cleaned),
        "content": cleaned,
        "tags": _extract_tags(cleaned),
        "source": "chat",
        "source_url": None,
        "confidence": confidence,
    }


def _message_text(message: dict) -> str:
    for key in ("text", "content"):
        value = message.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return ""


def extract_memories_from_messages(messages: list, limit: int | None = None) -> list[dict]:
    """Extract memory records from user messages, highest confidence first."""
    extracted: list[dict] = []
    seen: set[str] = set()

    for message in messages:
        if not isinstance(message, dict):
            continue
        if str(message.get("role") or "").lower() not in {"user", "human"}:
            continue

        text = _message_text(message)
        if not text:
            continue

        for sentence in _split_sentences(_normalize(text)):
            memory = _build_memory_record(sentence)
            if memory is None:
                continue
            key = re.sub(r"[\s.!]+$", "", memory["content"].lower())
            if key in seen:
                continue
            seen.add(key)
            extracted.append(memory)

    extracted.sort(key=lambda m: -m["confidence"])  # stable: ties keep conversation order
    return extracted[:limit] if limit else extracted