import { useMemo, useState } from 'react';
import { API_BASE_URL, fetchJson, getToken } from '../api/client';

function SettingsPanel({ chats, onReload, onLogout }) {
  const [status, setStatus] = useState('Not checked');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const archiveSize = useMemo(() => {
    const bytes = new Blob([JSON.stringify(chats)]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }, [chats]);

  const latestCapture = useMemo(() => {
    if (!chats.length) return 'No captures yet';
    const timestamps = chats
      .map((chat) => new Date(chat.captured_at).getTime())
      .filter(Number.isFinite);
    if (!timestamps.length) return 'Unknown';
    return new Date(Math.max(...timestamps)).toLocaleString();
  }, [chats]);

  const showMessage = (text) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 3500);
  };

  const checkConnection = async () => {
    setBusy(true);
    setStatus('Checking...');
    try {
      const response = await fetch(`${API_BASE_URL}/healthz`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setStatus(data.status === 'ok' ? 'Online' : 'Unexpected response');
    } catch (error) {
      setStatus(`Offline: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const exportArchive = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      count: chats.length,
      chats,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `synapse-archive-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showMessage('Archive exported.');
  };

  const clearArchive = async () => {
    if (!chats.length) {
      showMessage('There is no archive data to clear.');
      return;
    }

    const confirmed = window.confirm(
      `Delete ${chats.length} archived ${chats.length === 1 ? 'chat' : 'chats'}? This cannot be undone.`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await Promise.all(chats.map((chat) => fetchJson(`/chats/${chat.id}`, { method: 'DELETE' })));
      await onReload();
      showMessage('Archive cleared.');
    } catch (error) {
      showMessage(error.message || 'Could not clear archive.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-panel">
      <div className="settings-grid">
        <article className="settings-card">
          <div className="settings-card-header">
            <div>
              <span className="settings-kicker">Connection</span>
              <h2>API Status</h2>
            </div>
            <span className={status === 'Online' ? 'settings-pill online' : 'settings-pill'}>
              {status}
            </span>
          </div>

          <div className="settings-list">
            <div className="setting-row">
              <span>Endpoint</span>
              <strong>{API_BASE_URL}</strong>
            </div>
            <div className="setting-row">
              <span>Session token</span>
              <strong>{getToken() ? 'Stored locally' : 'Missing'}</strong>
            </div>
          </div>

          <button className="secondary" onClick={checkConnection} disabled={busy}>
            Check connection
          </button>
        </article>

        <article className="settings-card">
          <div className="settings-card-header">
            <div>
              <span className="settings-kicker">Archive</span>
              <h2>Data Tools</h2>
            </div>
            <span className="settings-pill">{chats.length} chats</span>
          </div>

          <div className="settings-list">
            <div className="setting-row">
              <span>Estimated export size</span>
              <strong>{archiveSize}</strong>
            </div>
            <div className="setting-row">
              <span>Latest capture</span>
              <strong>{latestCapture}</strong>
            </div>
          </div>

          <div className="settings-actions">
            <button className="secondary" onClick={onReload} disabled={busy}>
              Refresh archive
            </button>
            <button className="secondary" onClick={exportArchive} disabled={!chats.length || busy}>
              Export JSON
            </button>
            <button className="danger-btn" onClick={clearArchive} disabled={!chats.length || busy}>
              Clear archive
            </button>
          </div>
        </article>

        <article className="settings-card">
          <div className="settings-card-header">
            <div>
              <span className="settings-kicker">Account</span>
              <h2>Session</h2>
            </div>
          </div>

          <p className="settings-copy">
            Signing out removes the local access token from this browser. Your archived chats remain
            on the Synapse API unless you clear them first.
          </p>

          <button className="danger-btn" onClick={onLogout} disabled={busy}>
            Sign out
          </button>
        </article>
      </div>

      {message && <div className="settings-toast">{message}</div>}
    </section>
  );
}

export default SettingsPanel;
