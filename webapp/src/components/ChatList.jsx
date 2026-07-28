import ChatCard from './ChatCard';

function ChatList({ chats, loading, error, onReload, onOpenChat }) {
  return (
    <section className="section-card">
      <div className="section-header">
        <div>
          <h2>Recent Captures</h2>
          <p>Latest archived conversations from the extension.</p>
        </div>
        <button onClick={onReload} className="small secondary">
          Refresh
        </button>
      </div>

      {loading && <p className="empty-state">Loading chats…</p>}
      {error && <p className="empty-state">{error}</p>}
      {!loading && !error && !chats.length && <p className="empty-state">No captures found.</p>}

      <div className="chat-list">
        {chats.map((chat) => (
          <ChatCard key={chat.id} chat={chat} onOpen={onOpenChat} />
        ))}
      </div>
    </section>
  );
}

export default ChatList;