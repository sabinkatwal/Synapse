import { useMemo, useState } from 'react';

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'been',
  'before',
  'being',
  'between',
  'could',
  'does',
  'from',
  'have',
  'into',
  'just',
  'like',
  'more',
  'most',
  'over',
  'should',
  'some',
  'that',
  'their',
  'there',
  'these',
  'they',
  'this',
  'through',
  'what',
  'when',
  'where',
  'which',
  'with',
  'would',
  'your',
]);

function getMessageText(chat) {
  return (chat.messages || [])
    .map((message) => message.content || message.text || message.message || '')
    .join(' ');
}

function getKeywords(text) {
  const counts = new Map();
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
    .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16);
}

function MemoriesPanel({ chats, onOpenChat }) {
  const [query, setQuery] = useState('');

  const indexedChats = useMemo(() => {
    return chats.map((chat) => {
      const text = getMessageText(chat);
      return {
        ...chat,
        memoryText: text,
        searchableText: `${chat.title || ''} ${chat.site || ''} ${chat.url || ''} ${text}`.toLowerCase(),
      };
    });
  }, [chats]);

  const keywords = useMemo(() => {
    return getKeywords(indexedChats.map((chat) => chat.memoryText).join(' '));
  }, [indexedChats]);

  const filteredChats = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return indexedChats.slice(0, 8);
    return indexedChats.filter((chat) => chat.searchableText.includes(normalizedQuery)).slice(0, 12);
  }, [indexedChats, query]);

  const strongestMemory = indexedChats.reduce((best, chat) => {
    const score = (chat.memoryText || '').length;
    return score > (best?.memoryText || '').length ? chat : best;
  }, null);

  return (
    <section className="memory-panel">
      <div className="memory-grid">
        <article className="memory-card memory-card-wide">
          <div className="section-header">
            <div>
              <h2>Memory Explorer</h2>
              <p>Search across captured conversations and reopen the context that matters.</p>
            </div>
          </div>

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, sites, URLs, or message text"
          />

          <div className="memory-results">
            {filteredChats.map((chat) => (
              <button
                key={chat.id}
                className="memory-result"
                type="button"
                onClick={() => onOpenChat(chat)}
              >
                <span>
                  <strong>{chat.title || 'Untitled conversation'}</strong>
                  <small>
                    {chat.site} - {new Date(chat.captured_at).toLocaleString()}
                  </small>
                </span>
                <em>{(chat.memoryText || 'No captured text').slice(0, 180)}</em>
              </button>
            ))}

            {!filteredChats.length && (
              <div className="empty-state">No memories match your search.</div>
            )}
          </div>
        </article>

        <article className="memory-card">
          <div className="section-header">
            <div>
              <h2>Top Topics</h2>
              <p>Frequent terms across your archive.</p>
            </div>
          </div>

          <div className="topic-cloud">
            {keywords.map(([word, count]) => (
              <button key={word} type="button" className="topic-chip" onClick={() => setQuery(word)}>
                {word}
                <span>{count}</span>
              </button>
            ))}
            {!keywords.length && <div className="empty-state">Capture chats to build topics.</div>}
          </div>
        </article>

        <article className="memory-card">
          <div className="section-header">
            <div>
              <h2>Strongest Memory</h2>
              <p>The capture with the richest stored context.</p>
            </div>
          </div>

          {strongestMemory ? (
            <button className="memory-spotlight" type="button" onClick={() => onOpenChat(strongestMemory)}>
              <strong>{strongestMemory.title || 'Untitled conversation'}</strong>
              <span>{strongestMemory.messages.length} messages</span>
              <p>{strongestMemory.memoryText.slice(0, 220)}</p>
            </button>
          ) : (
            <div className="empty-state">No memory data yet.</div>
          )}
        </article>
      </div>
    </section>
  );
}

export default MemoriesPanel;
