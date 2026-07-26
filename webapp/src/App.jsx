import { useEffect, useMemo, useState } from 'react';

const API_BASE_URL = 'http://127.0.0.1:8000';

function fetchJson(path, options = {}) {
  const token = localStorage.getItem('authToken');
  return fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
  });
}

function Dashboard({ onLogout }) {
  const [chats, setChats] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const favoriteCount = useMemo(() => chats.filter((chat) => chat.favorite).length, [chats]);

  const siteCounts = useMemo(() => {
    return chats.reduce((acc, chat) => {
      acc[chat.site] = (acc[chat.site] || 0) + 1;
      return acc;
    }, {});
  }, [chats]);

  const topSite = useMemo(() => {
    const entries = Object.entries(siteCounts);
    if (!entries.length) return null;
    return entries.sort((a, b) => b[1] - a[1])[0];
  }, [siteCounts]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await fetchJson('/chats');
        setChats(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="dashboard-shell">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">Synapse</p>
          <h1>Chat Archive Dashboard</h1>
          <p>Analyze captures, inspect trends, and manage archived conversations from your browser.</p>
        </div>
        <button className="secondary" onClick={onLogout}>Logout</button>
      </header>

      <section className="stats-grid">
        <article className="stat-card">
          <span>Total captures</span>
          <strong>{chats.length}</strong>
        </article>
        <article className="stat-card">
          <span>Favorites</span>
          <strong>{favoriteCount}</strong>
        </article>
        <article className="stat-card">
          <span>Top site</span>
          <strong>{topSite ? `${topSite[0]} (${topSite[1]})` : '—'}</strong>
        </article>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <h2>Recent Captures</h2>
            <p>Latest archived conversations from the extension.</p>
          </div>
          <button onClick={() => window.location.reload()} className="small secondary">Refresh</button>
        </div>

        {loading && <p className="empty-state">Loading chats…</p>}
        {error && <p className="empty-state">{error}</p>}
        {!loading && !error && !chats.length && <p className="empty-state">No captures found.</p>}

        <div className="chat-list">
          {chats.map((chat) => (
            <article key={chat.id} className="chat-card">
              <div>
                <h3>{chat.title || chat.url}</h3>
                <p>{chat.site} · {new Date(chat.captured_at).toLocaleString()} · {chat.messages.length} messages</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <h2>Site breakdown</h2>
            <p>Platforms with the most archived chats.</p>
          </div>
        </div>
        <div className="breakdown-grid">
          {Object.entries(siteCounts).map(([site, count]) => (
            <article key={site} className="breakdown-card">
              <span>{site}</span>
              <strong>{count}</strong>
            </article>
          ))}
          {!Object.keys(siteCounts).length && <p className="empty-state">No site analytics available.</p>}
        </div>
      </section>
    </div>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('authToken'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setError('');
    setLoading(true);
    try {
      const response = await fetchJson('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('authToken', response.access_token);
      setIsLoggedIn(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <div className="section-header">
            <div>
              <h2>Sign in to Synapse</h2>
              <p>View your archived chats and analytics in the dashboard.</p>
            </div>
          </div>
          <div className="form-grid">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
            <button onClick={login} disabled={loading}>{loading ? 'Signing in…' : 'Login'}</button>
            {error && <p className="empty-state">{error}</p>}
          </div>
        </section>
      </div>
    );
  }

  return <Dashboard onLogout={logout} />;
}

export default App;
