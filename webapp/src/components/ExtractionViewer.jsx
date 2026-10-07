import { useEffect, useState } from 'react';
import { extractConversation, pushConversationPrompt } from '../api/extension';
import './ChatViewer.css';

function ExtractionViewer({ chat, onClose }) {
  const [memories, setMemories] = useState(null);
  const [debug, setDebug] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;

    extractConversation(chat)
      .then((result) => {
        if (!cancelled) {
          setMemories(result?.memories || []);
          setDebug(result?.debug || null);
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chat]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handlePush() {
    if (!memories) return;
    setPushing(true);
    setStatus('');
    try {
      await pushConversationPrompt(chat, memories);
      setStatus('Prompt stored in the extension textarea.');
    } catch (pushError) {
      setStatus(pushError.message);
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="viewer-overlay" onClick={onClose}>
      <section className="extraction-viewer" onClick={(event) => event.stopPropagation()}>
        <header className="extraction-header">
          <div>
            <span className="panel-kicker">Memory Extraction</span>
            <h2>{chat.title || 'Untitled conversation'}</h2>
            <p>{chat.site} · {chat.messages?.length || 0} messages</p>
          </div>
          <button className="close-btn" onClick={onClose} title="Close extraction view">✕</button>
        </header>

        <div className="extraction-body">
          {loading && <div className="extraction-state">Extracting structured memories…</div>}
          {error && <div className="extraction-state extraction-error">{error}</div>}
          {!loading && !error && !memories?.length && (
            <div className="extraction-state">
              <div>
                <strong>No structured memories were found.</strong>
                <p>
                  Scanned {debug?.user_messages || 0} user messages and {debug?.sentences_examined || 0} sentences.
                  {debug?.rejections?.question || debug?.rejections?.request
                    ? ' Most were questions or requests.'
                    : ' No durable statements matched the memory rules.'}
                </p>
              </div>
            </div>
          )}
          {!loading && !error && memories?.length > 0 && (
            <div className="extraction-results">
              <div className="extraction-summary">
                <strong>{memories.length}</strong>
                <span>memories extracted</span>
              </div>
              {memories.map((memory) => (
                <article className="extraction-result" key={memory.id || `${memory.memory_type}-${memory.content}`}>
                  <div className="extraction-result-topline">
                    <span>{memory.memory_type}</span>
                    <small>{Math.round((memory.confidence || 0) * 100)}% confidence</small>
                  </div>
                  <h3>{memory.title || 'Untitled memory'}</h3>
                  <p>{memory.content}</p>
                  {!!memory.tags?.length && <div className="extraction-tags">{memory.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>}
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="extraction-footer">
          <span className={status ? 'extraction-status' : 'extraction-status muted'}>
            {status || 'Review the extracted memories before pushing.'}
          </span>
          <div>
            <button className="small secondary" onClick={onClose}>Close</button>
            <button className="small" onClick={handlePush} disabled={!memories?.length || pushing}>
              {pushing ? 'Pushing…' : 'Push to extension'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export default ExtractionViewer;
