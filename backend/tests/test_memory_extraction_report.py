from app.services.memory_extractor import extract_memories_from_messages, extract_with_report


def run(text):
    return extract_memories_from_messages([{"role": "user", "text": text}])


def test_new_rule_based_patterns():
    positives = [
        ("We're on Next.js for the frontend.", "fact"),
        ("I work at Acme Labs.", "fact"),
        ("I'm in my final year at Tribhuvan University.", "fact"),
        ("My exam is on Friday.", "fact"),
        ("I'm based in Kathmandu.", "fact"),
        ("I speak Python and JavaScript.", "fact"),
        ("I'm stuck on the authentication flow.", "fact"),
        ("I decided to use Postgres.", "goal"),
        ("Remember that I use pnpm.", "fact"),
        ("Always answer briefly.", "instruction_preference"),
        ("Use TypeScript in examples.", "instruction_preference"),
    ]
    for text, expected in positives:
        assert run(text)[0]["memory_type"] == expected, text


def test_new_rules_do_not_capture_questions_or_current_tasks():
    negatives = [
        "Are we on Next.js?",
        "Can you find jobs at Acme Labs?",
        "What is the final year curriculum?",
        "Can you remind me about my exam on Friday?",
        "Where is Kathmandu?",
        "Can you explain Python and JavaScript?",
        "I'm stuck on this bug in the code above.",
        "Let's go with option 2.",
        "Yes, that one.",
        "Explain TypeScript in examples.",
    ]
    for text in negatives:
        assert run(text) == [], text


def test_report_rejections_and_acceptance_add_up():
    memories, report = extract_with_report([
        {"role": "user", "text": "I prefer Vim. What is the best editor? Please explain this code."},
        {"role": "assistant", "text": "I prefer Emacs."},
        {"role": "user", "text": ""},
    ])
    assert memories and report["user_messages"] == 2
    assert report["accepted"] + sum(report["rejections"].values()) == report["sentences_examined"]
    assert report["empty_text_skips"] == 1


def test_topic_memory_and_review_flag():
    memories, _ = extract_with_report(
        [{"role": "user", "text": "Can you compare deployment options?"}],
        title="Deployment planning",
        include_topic=True,
    )
    assert memories[0]["memory_type"] == "conversation_topic"
    assert memories[0]["needs_review"] is True