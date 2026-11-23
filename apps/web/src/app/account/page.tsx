'use client';

import { useState, type FormEvent } from 'react';
import { Hint } from '@/components/Hint';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/components/AuthProvider';
import { PasswordInput, PasswordRule, MIN_PASSWORD } from '@/components/PasswordInput';
import { api, ApiError } from '@/lib/api';

const ROLE_TEXT = {
  viewer: 'You can look at everything but not change it.',
  editor: 'You can also add findings, notes and chart markers.',
  admin: 'You can also manage people and data sources.',
} as const;

export default function Account() {
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (next !== again) return setError('The two new passwords do not match.');
    setBusy(true);
    setError('');
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setCurrent('');
      setNext('');
      setAgain('');
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Your account</h1>
      <Hint>Your details are set by an admin. You can change your own password here. Signing out, or changing your password, signs you out on every other device too.</Hint>

      <div className="card account-card">
        <strong>Profile</strong>
        <dl className="profile">
          <div><dt>Name</dt><dd>{user.name}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Role</dt><dd><span className="pill role">{user.role}</span> <span className="muted">{ROLE_TEXT[user.role]}</span></dd></div>
        </dl>
        <p className="muted">To change your name, email or role, ask an admin.</p>
      </div>

      <form className="card account-card" onSubmit={submit}>
        <strong>Change password</strong>
        <label htmlFor="cur">Current password</label>
        <PasswordInput id="cur" autoComplete="current-password" value={current} onChange={setCurrent} />
        <label htmlFor="new">New password</label>
        <PasswordInput id="new" autoComplete="new-password" minLength={MIN_PASSWORD} value={next} onChange={setNext} />
        <PasswordRule value={next} />
        <label htmlFor="again">Type the new password again</label>
        <PasswordInput id="again" autoComplete="new-password" minLength={MIN_PASSWORD} value={again} onChange={setAgain} />
        {error && <p className="error" role="alert">{error}</p>}
        {done && <p className="success" role="status"><Icon name="check" size={16} /> Password changed. Other devices have been signed out.</p>}
        <p><button className="primary" disabled={busy || next.length < MIN_PASSWORD}>{busy ? 'Saving…' : 'Change password'}</button></p>
      </form>

      <div className="card account-card">
        <strong>Sign out</strong>
        <p className="muted">Ends your session on this device and every other one.</p>
        <p><button onClick={logout}><Icon name="logout" size={14} />Sign out everywhere</button></p>
      </div>
    </>
  );
}
