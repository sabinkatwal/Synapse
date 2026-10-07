from app.services.message_adapter import normalize_messages


def test_chatgpt_shape():
    out = normalize_messages([{"role": "user", "content": "I prefer TypeScript."}], "chatgpt")
    assert out[0]["role"] == "user" and out[0]["text"] == "I prefer TypeScript."


def test_claude_shape():
    out = normalize_messages([{"role": "human", "content": [{"type": "text", "text": "I am studying law."}]}], "claude")
    assert out[0]["role"] == "user" and out[0]["text"] == "I am studying law."


def test_gemini_shape():
    out = normalize_messages([{"role": "model", "parts": [{"text": "I prefer concise answers."}]}], "gemini")
    assert out[0]["role"] == "assistant"


def test_plain_strings_and_list_parts():
    out = normalize_messages(["I use Vim.", {"role": "me", "content": ["I use Python.", {"text": "I live in Nepal."}]}])
    assert [item["role"] for item in out] == ["user", "user"]
    assert "I use Python." in out[1]["text"]


def test_html_entities_and_nested_content_are_cleaned():
    out = normalize_messages([{"role": "customer", "message": {"content": "<p>I&nbsp;prefer&nbsp;tabs.</p>"}}])
    assert out[0]["text"] == "I prefer tabs."


def test_garbage_and_unknown_roles_never_crash():
    assert normalize_messages([None, 3, {}, {"role": "alien", "content": "I prefer tea."}, {"role": "user", "content": []}]) == []