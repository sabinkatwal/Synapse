import pytest

from app.services.memory_extractor import (
    _extract_tags,
    _make_title,
    extract_memories_from_messages,
)


def run(*texts, role="user", **kw):
    return extract_memories_from_messages([{"role": role, "text": t} for t in texts], **kw)


def one(text):
    out = run(text)
    assert len(out) == 1, out
    return out[0]


# ---- classification -------------------------------------------------------
@pytest.mark.parametrize(
    "text,expected",
    [
        ("I prefer dark mode in all my editors.", "preference"),
        ("I don\u2019t like tabs in Python files.", "preference"),
        ("I always use pnpm for new projects.", "preference"),
        ("I want to build a chat app.", "goal"),          # was misfiled as preference
        ("I need to finish my thesis draft.", "goal"),
        ("I'm preparing for the IOE exam.", "goal"),
        ("I'm building a Chrome extension for archiving chats.", "project"),
        ("My name is Sabin.", "fact"),
        ("We use FastAPI and React.", "fact"),
        ("I'm a student at Pulchowk Campus.", "fact"),
    ],
)
def test_classification(text, expected):
    assert one(text)["memory_type"] == expected


@pytest.mark.parametrize(
    "text",
    [
        "Fix this bug in my login page.",
        "ok let's try that approach",
        "Can you explain what I am building?",
        "What do I prefer when coding?",
        "I'm a bit confused about this.",
        "I want to know how JWT works.",
        "Hello!",
        "const x = items.map(i => i.id);",
        "Traceback (most recent call last):",
    ],
)
def test_rejected(text):
    assert run(text) == []


def test_greeting_prefix_is_stripped_not_dropped():
    assert one("Hi, I need to learn Docker by Friday.")["content"].startswith("I need to")


# ---- safety ---------------------------------------------------------------
@pytest.mark.parametrize(
    "text",
    [
        "My API key is sk-abcdefghijklmnopqrstuvwxyz123456",
        "I use token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
        "My password is hunter2",
        "I use AKIAIOSFODNN7EXAMPLE for AWS access.",
        "My email is someone@example.com and I use Gmail.",
    ],
)
def test_secrets_are_never_stored(text):
    assert run(text) == []


def test_code_blocks_are_ignored():
    text = "I'm building an API.\n```python\nI use secrets = 1\nprint('I like x')\n```\nI prefer SQLite."
    types = [m["memory_type"] for m in run(text)]
    assert sorted(types) == ["preference", "project"]


# ---- sentence splitting / dedup / ordering ----------------------------------
def test_abbreviations_do_not_split():
    out = run("I use tools e.g. Vim and tmux. I prefer dark mode.")
    assert len(out) == 2
    assert out[1]["content"] == "I use tools e.g. Vim and tmux."  # fact (0.65) sorted after preference


def test_dedup_and_confidence_sort_and_limit():
    out = run("I use Vim daily.", "i use vim daily", "I prefer dark mode.")
    assert [m["memory_type"] for m in out] == ["preference", "fact"]
    assert len(run("I use Vim daily.", "I prefer dark mode.", limit=1)) == 1


def test_hedged_statements_score_lower():
    assert one("I probably prefer dark mode.")["confidence"] < one("I prefer dark mode.")["confidence"]


def test_non_dict_and_assistant_messages_ignored():
    msgs = [None, "I prefer tea.", {"role": "assistant", "text": "I prefer coffee."}, {"role": "user", "content": "I prefer vim."}]
    out = extract_memories_from_messages(msgs)
    assert [m["content"] for m in out] == ["I prefer vim."]


# ---- tags / title -----------------------------------------------------------
def test_tags_prefer_tech_terms_and_skip_filler():
    tags = _extract_tags("I want to build a chat app using FastAPI and React with Node.js")
    assert "want" not in tags and "build" not in tags
    assert {"fastapi", "react", "node.js"} <= set(tags[:3])


def test_short_tech_tags_allowed():
    assert "ai" in _extract_tags("I work on AI tooling") and "c++" in _extract_tags("I write C++ daily")


def test_title_cuts_on_word_boundary():
    title = _make_title("word " * 40)
    assert len(title) <= 80 and title.endswith("\u2026") and not title.endswith(" \u2026")
    assert _make_title("short") == "short"


@pytest.mark.parametrize(
    "text",
    ["I need to fix this CORS error.", "I want to understand the code above.", "I have to debug that function."],
)
def test_one_off_tasks_are_not_goals(text):
    assert run(text) == []