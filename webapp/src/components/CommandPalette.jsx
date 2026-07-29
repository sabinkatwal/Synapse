import { useEffect, useMemo, useState } from 'react';

function getText(chat) {
  return `${chat.title || ''} ${chat.site || ''} ${chat.url || ''} ${(chat.messages || [])
    .map((message) => message.content || message.text || message.message || '')
    .join(' ')}`;
}

function CommandPalette({ open, chats, menuItems, onClose, onNavigate, onOpenChat }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const navigation = menuItems
      .filter((item) => !normalized || item.label.toLowerCase().includes(normalized))
      .map((item) => ({
        id: `nav-${item.id}`,
        label: item.label,
        meta: 'Navigate',
        action: () => onNavigate(item.id),
      }));

    const conversations = chats
      .filter((chat) => !normalized || getText(chat).toLowerCase().includes(normalized))
      .slice(0, 8)
      .map((chat) => ({
        id: `chat-${chat.id}`,
        label: chat.title || 'Untitled conversation',
        meta: `${chat.site} - ${chat.messages?.length || 0} messages`,
        action: () => onOpenChat(chat),
      }));

    return [...navigation, ...conversations].slice(0, 12);
  }, [chats, menuItems, onNavigate, onOpenChat, query]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Enter' && results[0]) {
        results[0].action();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, open, results]);

  if (!open) return null;

  return (
    <div className="command-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(event) => event.stopPropagation()}>
        <div className="command-search">
          <span>Search</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, conversations, memory, topics..."
          />
        </div>

        <div className="command-results">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => {
                result.action();
                onClose();
              }}
            >
              <strong>{result.label}</strong>
              <span>{result.meta}</span>
            </button>
          ))}
          {!results.length && <div className="empty-state">No results found.</div>}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
