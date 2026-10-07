"""Shared text helpers for rule-based memory extraction and retrieval."""
from __future__ import annotations

import re

BASE_STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "as", "at",
    "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can", "could",
    "did", "do", "does", "doing", "don", "down", "during", "each", "few", "for", "from", "further", "get",
    "had", "has", "have", "having", "he", "help", "her", "here", "hers", "herself", "him", "himself", "his",
    "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "make", "me", "more", "most", "my",
    "myself", "need", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "our", "ours",
    "ourselves", "out", "over", "own", "please", "same", "she", "should", "so", "some", "such", "t", "than",
    "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they", "this", "those",
    "through", "to", "too", "under", "until", "up", "use", "using", "very", "want", "was", "we", "were",
    "what", "when", "where", "which", "while", "who", "whom", "why", "will", "with", "would", "you", "your",
    "yours", "yourselves",
}

FILLER_STOPWORDS = {
    "also", "always", "app", "bit", "build", "building", "called", "could", "currently", "e.g", "enjoy", "etc",
    "favored", "going", "good", "hate", "i.e", "know", "let", "like", "little", "lot", "love", "make", "many",
    "maybe", "much", "name", "named", "need", "never", "new", "now", "one", "plan", "prefer", "probably",
    "project", "really", "right", "something", "still", "thing", "things", "think", "try", "trying", "use",
    "used", "using", "usually", "want", "well", "work", "working", "would",
}

STOPWORDS = BASE_STOPWORDS | FILLER_STOPWORDS

SHORT_TECH_TERMS = {"ai", "ml", "ui", "ux", "go", "db", "js", "ts", "qa", "ci", "cd", "vm", "os", "c#", "c++", "r"}

TOKEN_RE = re.compile(r"[^\W_][\w+#./-]*", re.UNICODE)


def stem(word: str) -> str:
    """Small deterministic stemmer tuned for memory matching."""
    word = word.lower().rstrip("./-_")
    if len(word) <= 3:
        return word

    replacements = (
        ("ation", "e"),
        ("ments", ""),
        ("ment", ""),
        ("ying", "y"),
        ("ies", "y"),
        ("ers", ""),
        ("er", ""),
        ("ings", ""),
        ("ing", ""),
        ("edly", ""),
        ("ed", ""),
        ("ly", ""),
    )
    for suffix, replacement in replacements:
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            word = word[: -len(suffix)] + replacement
            break

    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        word = word[:-1]
    return word


def tokens(text: str, *, include_stopwords: bool = False) -> list[str]:
    out: list[str] = []
    for raw in TOKEN_RE.findall((text or "").lower().replace("\u2019", "'")):
        word = raw.rstrip("./-_")
        if not word or word.isdigit():
            continue
        if not include_stopwords and word in STOPWORDS:
            continue
        if len(word) < 3 and word not in SHORT_TECH_TERMS:
            continue
        out.append(stem(word))
    return out
