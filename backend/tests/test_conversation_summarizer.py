from app.services import conversation_summarizer as summarizer


class FakeCompletions:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)

        class Message:
            content = (
                '{"conversation_summary":"summary","current_objective":"objective",'
                '"progress":"progress","decisions":[],"unresolved_questions":[]'
                ',"next_steps":[],"important_context":[]}'
            )

        class Choice:
            message = Message()

        class Response:
            choices = [Choice()]

        return Response()


class FakeClient:
    def __init__(self, completions):
        self.chat = type("Chat", (), {"completions": completions})()


def test_long_conversations_are_summarized_in_bounded_chunks(monkeypatch):
    completions = FakeCompletions()
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setattr(
        "groq.Groq",
        lambda api_key: FakeClient(completions),
    )

    result = summarizer.generate_handoff_summary(
        [{"role": "user", "text": "x" * 5_000} for _ in range(6)],
        site="grok",
    )

    assert result["conversation_summary"] == "summary"
    assert len(completions.calls) > 1
    assert all(
        len(call["messages"][1]["content"]) <= summarizer.CHUNK_CHARS + 500
        for call in completions.calls
    )
