function ChatCard({ chat, onOpen, onExtract }) {
  function handleExtract(event) {
    event.stopPropagation();
    onExtract(chat);
  }

  return (
    <article className="chat-card" onClick={() => onOpen(chat)} role="button" tabIndex={0}>
      <div>
        <h3>{chat.title || chat.url}</h3>
        <p>
          {chat.site} · {new Date(chat.captured_at).toLocaleString()} · {chat.messages.length} messages
        </p>
      </div>
      <div className="chat-card-actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="small secondary" onClick={handleExtract}>
          View extraction
        </button>
      </div>
    </article>
  );
}

export default ChatCard;