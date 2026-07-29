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

const CATEGORY_RULES = [
  { name: 'Programming', terms: ['react', 'api', 'code', 'function', 'component', 'database', 'auth', 'jwt'] },
  { name: 'Learning', terms: ['learn', 'study', 'explain', 'course', 'notes', 'practice', 'guide'] },
  { name: 'Projects', terms: ['project', 'feature', 'build', 'design', 'release', 'dashboard', 'extension'] },
  { name: 'Career', terms: ['interview', 'resume', 'job', 'career', 'portfolio', 'company'] },
  { name: 'Ideas', terms: ['idea', 'brainstorm', 'concept', 'plan', 'strategy', 'vision'] },
  { name: 'Research', terms: ['research', 'source', 'compare', 'analysis', 'paper', 'market'] },
];

function getMessageText(chat) {
  return (chat.messages || [])
    .map((message) => message.content || message.text || message.message || '')
    .join(' ');
}

function getKeywords(text, limit = 18) {
  const counts = new Map();
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
    .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function getCategory(text) {
  const normalized = text.toLowerCase();
  const match = CATEGORY_RULES.find((category) =>
    category.terms.some((term) => normalized.includes(term))
  );
  return match?.name || 'Long-Term';
}

function getConfidence(chat) {
  const messageCount = chat.messages?.length || 0;
  const textLength = getMessageText(chat).length;
  if (messageCount >= 12 || textLength > 5000) return 'High';
  if (messageCount >= 5 || textLength > 1600) return 'Medium';
  return 'Emerging';
}

function MemoriesPanel({ chats, onOpenChat }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const memories = useMemo(() => {
    return chats.map((chat) => {
      const text = getMessageText(chat);
      const category = getCategory(`${chat.title || ''} ${text}`);
      return {
        ...chat,
        category,
        confidence: getConfidence(chat),
        memoryText: text,
        searchableText: `${chat.title || ''} ${chat.site || ''} ${chat.url || ''} ${category} ${text}`.toLowerCase(),
        keywords: getKeywords(text, 5),
      };
    });
  }, [chats]);

  const keywords = useMemo(() => {
    return getKeywords(memories.map((memory) => memory.memoryText).join(' '));
  }, [memories]);

  const categories = useMemo(() => {
    const counts = memories.reduce((acc, memory) => {
      acc[memory.category] = (acc[memory.category] || 0) + 1;
      return acc;
    }, {});
    return ['All', ...CATEGORY_RULES.map((category) => category.name), 'Long-Term'].map((name) => ({
      name,
      count: name === 'All' ? memories.length : counts[name] || 0,
    }));
  }, [memories]);

  const filteredMemories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return memories
      .filter((memory) => activeCategory === 'All' || memory.category === activeCategory)
      .filter((memory) => !normalizedQuery || memory.searchableText.includes(normalizedQuery))
      .slice(0, 12);
  }, [activeCategory, memories, query]);

  const pinnedMemory = memories.reduce((best, memory) => {
    const score = (memory.messages?.length || 0) * 200 + (memory.memoryText || '').length;
    const bestScore = best ? (best.messages?.length || 0) * 200 + (best.memoryText || '').length : 0;
    return score > bestScore ? memory : best;
  }, null);

  const recentMemories = memories
    .slice()
    .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))
    .slice(0, 4);

  return (
    <section className="memory-os">
      <div className="ai-hero-panel">
        <div>
          <span className="panel-kicker">AI Memory OS</span>
          <h2>Your second brain, organized from every captured conversation.</h2>
          <p>
            Ask, filter, and reopen the source material behind your recurring ideas, projects,
            learning loops, and research threads.
          </p>
        </div>
        <div className="memory-health-card">
          <span>Memory Health</span>
          <strong>{memories.length ? 'Active' : 'Dormant'}</strong>
          <small>{memories.length} memories indexed</small>
        </div>
      </div>

      <div className="ask-memory-card">
        <label htmlFor="memory-search">Ask Memory</label>
        <input
          id="memory-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ask: What did I learn about authentication, React, interviews..."
        />
      </div>

      <div className="memory-category-strip">
        {categories.map((category) => (
          <button
            key={category.name}
            type="button"
            className={activeCategory === category.name ? 'category-chip active' : 'category-chip'}
            onClick={() => setActiveCategory(category.name)}
          >
            {category.name}
            <span>{category.count}</span>
          </button>
        ))}
      </div>

      <div className="memory-layout">
        <article className="memory-card memory-primary">
          <div className="section-header">
            <div>
              <h2>Relevant Memory</h2>
              <p>Ranked memories matching your current context.</p>
            </div>
          </div>

          <div className="memory-results">
            {filteredMemories.map((memory) => (
              <button
                key={memory.id}
                className="memory-result"
                type="button"
                onClick={() => onOpenChat(memory)}
              >
                <span className="memory-result-topline">
                  <strong>{memory.title || 'Untitled conversation'}</strong>
                  <small>{memory.confidence} confidence</small>
                </span>
                <em>{memory.memoryText || 'No captured text available.'}</em>
                <span className="memory-meta-row">
                  <small>{memory.site}</small>
                  <small>{memory.category}</small>
                  <small>{new Date(memory.captured_at).toLocaleDateString()}</small>
                </span>
              </button>
            ))}

            {!filteredMemories.length && (
              <div className="empty-state">No memories match this context yet.</div>
            )}
          </div>
        </article>

        <aside className="memory-side-stack">
          <article className="memory-card">
            <div className="section-header">
              <div>
                <h2>Pinned Memory</h2>
                <p>Highest-signal capture in your archive.</p>
              </div>
            </div>

            {pinnedMemory ? (
              <button className="memory-spotlight" type="button" onClick={() => onOpenChat(pinnedMemory)}>
                <strong>{pinnedMemory.title || 'Untitled conversation'}</strong>
                <span>{pinnedMemory.category} - {pinnedMemory.messages.length} related chats</span>
                <p>{pinnedMemory.memoryText.slice(0, 260)}</p>
              </button>
            ) : (
              <div className="empty-state">Capture chats to pin strong memory.</div>
            )}
          </article>

          <article className="memory-card">
            <div className="section-header">
              <div>
                <h2>Top Topics</h2>
                <p>Terms that appear most often.</p>
              </div>
            </div>

            <div className="topic-cloud">
              {keywords.map(([word, count]) => (
                <button key={word} type="button" className="topic-chip" onClick={() => setQuery(word)}>
                  {word}
                  <span>{count}</span>
                </button>
              ))}
              {!keywords.length && <div className="empty-state">No topics yet.</div>}
            </div>
          </article>
        </aside>
      </div>

      <article className="memory-card">
        <div className="section-header">
          <div>
            <h2>Memory Timeline</h2>
            <p>Recent captures ready to become long-term context.</p>
          </div>
        </div>

        <div className="memory-timeline">
          {recentMemories.map((memory) => (
            <button key={memory.id} type="button" onClick={() => onOpenChat(memory)}>
              <span />
              <strong>{memory.title || memory.site}</strong>
              <small>{new Date(memory.captured_at).toLocaleString()}</small>
            </button>
          ))}
          {!recentMemories.length && <div className="empty-state">No recent memories yet.</div>}
        </div>
      </article>
    </section>
  );
}

export default MemoriesPanel;
