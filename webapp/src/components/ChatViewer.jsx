import { useEffect, useRef } from 'react';
import './ChatViewer.css';

// Normalize messages from different sources
function normalizeMessage(message) {
  const rawRole = message.role || message.sender || message.author || 'assistant';
  const role = String(rawRole).toLowerCase().includes('user') ? 'user' : 'assistant';
  const text = message.content ?? message.text ?? message.message ?? '';
  const timestamp = message.timestamp || message.created_at || null;
  return { role, text, timestamp };
}

function ChatViewer({ chat, onClose }) {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  if (!chat) return null;

  const messages = chat.messages.map(normalizeMessage);
  const capturedDate = new Date(chat.captured_at);

  return (
    <div className="viewer-overlay" onClick={onClose}>
      <div className="chat-viewer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-info">
            <h2 className="chat-title">{chat.title || 'Untitled Conversation'}</h2>
            <div className="chat-meta">
              <span className="meta-badge">{chat.site}</span>
              <span className="meta-text">
                {capturedDate.toLocaleDateString()} at {capturedDate.toLocaleTimeString()}
              </span>
              <span className="meta-text">
                {messages.length} {messages.length === 1 ? 'message' : 'messages'}
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* Messages Container */}
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              <span>📭</span>
              <p>No messages captured for this conversation</p>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className="message-bubble">
                    <div className="message-role">
                      {msg.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    <div className="message-content">
                      {msg.text}
                    </div>
                    {msg.timestamp && (
                      <div className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatViewer;