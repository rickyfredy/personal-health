import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { username: name } = await api.login(username, password);
      onLogin(name);
    } catch (err) {
      setError(err.message || 'Could not sign in.');
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="wordmark">
          Callista
          <small>personal health history</small>
        </div>
        {error && (
          <div className="form-error" role="alert" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}
        <div className="login-form">
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 4 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>
            First time? Sign in with the default account: admin / admin
          </p>
        </div>
      </form>
    </div>
  );
}