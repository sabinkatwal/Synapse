function ChatCard({ chat, onOpen }) {
  return (
    <article className="chat-card" onClick={() => onOpen(chat)} role="button" tabIndex={0}>
      <div>
        <h3>{chat.title || chat.url}</h3>
        <p>
          {chat.site} · {new Date(chat.captured_at).toLocaleString()} · {chat.messages.length} messages
        </p>
      </div>
    </article>
  );
}

export default ChatCard;