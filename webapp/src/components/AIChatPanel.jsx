import { useMemo, useState } from 'react';

const EXAMPLE_PROMPTS = [
  'What did I learn about authentication?',
  'Summarize my React discussions.',
  'Find conversations about the extension.',
  'What topics keep coming back?',
];

function getMessageText(chat) {
  return (chat.messages || [])
    .map((message) => message.content || message.text || message.message || '')
    .join(' ');
}

function getTerms(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function scoreChat(chat, terms) {
  const haystack = `${chat.title || ''} ${chat.site || ''} ${chat.url || ''} ${getMessageText(chat)}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function buildAnswer(question, sources) {
  if (!question.trim()) {
    return 'Ask a question about your captured conversations and Synapse will assemble a source-backed answer from your archive.';
  }

  if (!sources.length) {
    return 'I could not find matching captured conversations yet. Capture more chats or try a broader query.';
  }

  const providers = [...new Set(sources.map((source) => source.site))].join(', ');
  const messageCount = sources.reduce((sum, source) => sum + (source.messages?.length || 0), 0);
  const topTitles = sources
    .slice(0, 3)
    .map((source) => source.title || source.site || 'Untitled conversation')
    .join('; ');

  return `I found ${sources.length} relevant source${sources.length === 1 ? '' : 's'} across ${providers}. Together they contain ${messageCount} captured messages. The strongest references are: ${topTitles}.`;
}

function AIChatPanel({ chats, onOpenChat }) {
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');

  const sources = useMemo(() => {
    const terms = getTerms(submittedQuestion || question);
    if (!terms.length) return chats.slice(0, 4);
    return chats
      .map((chat) => ({ chat, score: scoreChat(chat, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => item.chat);
  }, [chats, question, submittedQuestion]);

  const answer = useMemo(() => {
    return buildAnswer(submittedQuestion, sources);
  }, [submittedQuestion, sources]);

  const ask = (value = question) => {
    setQuestion(value);
    setSubmittedQuestion(value);
  };

  return (
    <section className="ai-chat-os">
      <div className="ai-hero-panel">
        <div>
          <span className="panel-kicker">AI Chat</span>
          <h2>Ask your archive like a second brain.</h2>
          <p>
            Query your captured conversations, inspect the sources, and jump back into the exact
            context behind every answer.
          </p>
        </div>
        <div className="memory-health-card">
          <span>Indexed Sources</span>
          <strong>{chats.length}</strong>
          <small>captured conversations</small>
        </div>
      </div>

      <div className="ai-chat-layout">
        <article className="ai-chat-card ai-chat-main">
          <div className="ai-chat-thread">
            <div className="ai-message assistant">
              <span>Synapse</span>
              <p>{answer}</p>
            </div>

            {submittedQuestion && (
              <div className="ai-message user">
                <span>You</span>
                <p>{submittedQuestion}</p>
              </div>
            )}
          </div>

          <form
            className="ai-compose"
            onSubmit={(event) => {
              event.preventDefault();
              ask();
            }}
          >
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask: What did Claude tell me about JWT?"
            />
            <button type="submit">Ask Synapse</button>
          </form>
        </article>

        <aside className="ai-chat-side">
          <article className="ai-chat-card">
            <div className="section-header">
              <div>
                <h2>Prompt Starters</h2>
                <p>Useful questions for your archive.</p>
              </div>
            </div>
            <div className="prompt-list">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" onClick={() => ask(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </article>

          <article className="ai-chat-card">
            <div className="section-header">
              <div>
                <h2>Sources</h2>
                <p>Conversations used for this answer.</p>
              </div>
            </div>
            <div className="source-list">
              {sources.map((chat) => (
                <button key={chat.id} type="button" onClick={() => onOpenChat(chat)}>
                  <strong>{chat.title || 'Untitled conversation'}</strong>
                  <span>{chat.site} - {chat.messages?.length || 0} messages</span>
                </button>
              ))}
              {!sources.length && <div className="empty-state">No matching sources yet.</div>}
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}

export default AIChatPanel;
