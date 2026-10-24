import { useState } from 'react';
import { api } from '../api.js';
import { I, Icon } from './icons.jsx';

export default function Login({ onDone }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      setPassword('');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <div className="brand">
          <span className="logo" aria-hidden="true"><Icon as={I.LockKey} size="lg" /></span>
          <h1>Outreach Desk</h1>
        </div>
        <p className="hint">Sign in to open your queue.</p>
        <div className="field">
          <label className="label" htmlFor="login-password">Password</label>
          <div className="input-icon">
            <input
              id="login-password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'login-error' : undefined}
              style={{ paddingLeft: 'var(--s-3)', paddingRight: 56 }}
            />
            <button
              type="button"
              className="btn btn-quiet btn-icon"
              style={{ position: 'absolute', right: 0, top: 0 }}
              aria-label={show ? 'Hide password' : 'Show password'}
              aria-pressed={show}
              onClick={() => setShow((v) => !v)}
            >
              <Icon as={show ? I.EyeSlash : I.Eye} />
            </button>
          </div>
        </div>
        {error && (
          <div className="notice notice-bad" role="alert" id="login-error">
            <Icon as={I.XCircle} />
            <div>{error}</div>
          </div>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy || !password}>{busy ? 'Signing in' : 'Sign in'}</button>
      </form>
    </main>
  );
}
