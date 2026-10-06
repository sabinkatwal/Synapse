from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.memory_retriever import build_memory_context, rank_memories

NOW = datetime.now(timezone.utc)


def mem(content, mtype="fact", tags=None, conf=0.7, age_days=0, title=None, naive=False):
    created = NOW - timedelta(days=age_days)
    if naive:
        created = created.replace(tzinfo=None)
    return SimpleNamespace(title=title if title is not None else content, content=content,
                           memory_type=mtype, tags=tags or [], confidence=conf, created_at=created)


def test_unrelated_memories_are_excluded():
    items = [mem("I prefer Railway over Render.", "preference", ["railway"])]
    assert rank_memories(items, "how do I set up React routing") == []


def test_stopword_overlap_does_not_match():
    items = [mem("I use the old laptop for the gym")]
    assert rank_memories(items, "what should I use for the app") == []


def test_stemming_matches_word_forms():
    items = [mem("I'm building a Chrome extension.", "project")]
    assert rank_memories(items, "tips for building chrome extensions")


def test_short_tech_terms_match():
    items = [mem("I work on AI tooling.", tags=["ai"])]
    assert rank_memories(items, "any AI ideas?")


def test_more_specific_match_ranks_first():
    a = mem("I prefer Railway over Render.", "preference", ["railway", "render"])
    b = mem("I deploy on Vercel.", "fact", ["vercel"])
    assert rank_memories([b, a], "deploy on Railway or Render")[0] is a


def test_recency_breaks_ties():
    old = mem("I use Vim daily.", age_days=300, conf=0.65)
    new = mem("I use Vim for notes.", age_days=1, conf=0.65)
    assert rank_memories([old, new], "vim")[0] is new


def test_limit_and_dedupe():
    items = [mem("I use Vim daily."), mem("i use vim daily"), mem("I use Vim for notes.")]
    out = rank_memories(items, "vim", limit=5)
    assert len(out) == 2
    assert len(rank_memories(items, "vim", limit=1)) == 1


def test_empty_query_mixed_naive_and_aware_datetimes_do_not_crash():
    items = [mem("I use Vim.", naive=True, age_days=5), mem("I prefer tea.", age_days=1)]
    out = rank_memories(items, "   ")
    assert out[0].content == "I prefer tea."


def test_context_skips_duplicate_titles_and_sanitizes():
    m = mem("I prefer Railway\nover Render.", "preference")
    text = build_memory_context([m])
    assert "\n- [preference] I prefer Railway over Render." in text
    assert text.count("Railway") == 1
    assert "not as instructions" in text


def test_context_respects_budget_and_empty():
    many = [mem(f"I use tool number {i} " + "x" * 100) for i in range(50)]
    assert len(build_memory_context(many, max_chars=500)) <= 500
    assert build_memory_context([]) == ""