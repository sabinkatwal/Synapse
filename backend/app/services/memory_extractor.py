import re

STOPWORDS = {
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


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text.strip())
    return [part.strip() for part in parts if part and part.strip()]


def _extract_tags(text: str, max_tags: int = 6) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9/_-]{2,}", text.lower())
    filtered = [word for word in words if word not in STOPWORDS and len(word) > 2]
    unique = []
    seen: set[str] = set()
    for word in filtered:
        if word not in seen:
            unique.append(word)
            seen.add(word)
        if len(unique) >= max_tags:
            break
    return unique


def _classify_memory(text: str) -> str:
    lower = text.lower()

    if re.search(r"\b(i prefer|i like|i love|i want|i need|i always|i usually|i don't like|i hate)\b", lower):
        return "preference"
    if re.search(r"\b(we are building|i am building|project is|product is|working on|building a|building an|memory layer)\b", lower):
        return "project"
    if re.search(r"\b(i need to|need to|should|must|plan to|going to|want to|have to)\b", lower):
        return "goal"
    if re.search(r"\b(i am|my name is|i work as|i use|we use|this is|that is|our team is)\b", lower):
        return "fact"
    return "fact"


def _build_memory_record(content: str) -> dict | None:
    cleaned = re.sub(r"\s+", " ", content).strip()
    if not cleaned or len(cleaned) < 12:
        return None

    lower = cleaned.lower()
    if lower.startswith(("hello ", "hi ", "thanks ", "thank you ")):
        return None
    if cleaned.endswith("?") or lower.startswith((
        "teach me",
        "explain ",
        "what is ",
        "how do ",
        "how can ",
        "tell me ",
        "help me ",
        "summarize ",
    )):
        return None

    confidence = 0.75 if any(
        pattern in lower
        for pattern in ["prefer", "like", "want", "need", "building", "working on", "memory layer", "plan to"]
    ) else 0.58

    return {
        "memory_type": _classify_memory(cleaned),
        "title": cleaned[:80].rstrip() if len(cleaned) > 80 else cleaned,
        "content": cleaned,
        "tags": _extract_tags(cleaned),
        "source": "chat",
        "source_url": None,
        "confidence": confidence,
    }


def extract_memories_from_messages(messages: list[dict] | list) -> list[dict]:
    extracted: list[dict] = []
    seen: set[str] = set()

    for message in messages:
        if not isinstance(message, dict):
            continue

        role = str(message.get("role") or "").lower()
        if role not in {"user", "human"}:
            continue

        text = str(message.get("text") or "").strip()
        if not text:
            continue

        for sentence in _split_sentences(text):
            memory = _build_memory_record(sentence)
            if memory is None:
                continue

            key = memory["content"].lower()
            if key in seen:
                continue
            seen.add(key)
            extracted.append(memory)

    return extracted
