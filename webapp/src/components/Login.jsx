import { useState } from 'react';

function Login({ onLogin, loading, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="section-header">
          <div>
            <h2>Sign in to Synapse</h2>
            <p>View your archived chats and analytics in the dashboard.</p>
          </div>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Login'}
          </button>
          {error && <p className="empty-state">{error}</p>}
        </form>
      </section>
    </div>
  );
}

export default Login;