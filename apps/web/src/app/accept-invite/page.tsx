'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { PasswordInput, PasswordRule, MIN_PASSWORD } from '@/components/PasswordInput';
import { api, ApiError } from '@/lib/api';

type Info = { name: string; email: string; purpose: 'invite' | 'reset' };
type View = { kind: 'checking' } | { kind: 'bad'; message: string } | { kind: 'ready'; info: Info };

/** Opened from an invite or password-reset link. The token is in the #fragment, so it never reaches server logs. */
export default function AcceptLink() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [view, setView] = useState<View>({ kind: 'checking' });
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? '';
    window.history.replaceState(null, '', window.location.pathname); // keep the token out of the address bar and history
    if (!t) {
      setView({ kind: 'bad', message: 'This page needs the link an admin sent you. Open that link again.' });
      return;
    }
    setToken(t);
    api<Info>('/auth/link/check', { method: 'POST', body: { token: t } })
      .then((info) => setView({ kind: 'ready', info }))
      .catch((e) => setView({ kind: 'bad', message: e instanceof ApiError ? e.message : 'Could not reach the server. Try again.' }));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== again) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/auth/link/accept', { method: 'POST', body: { token, password } });
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Try again.');
      setBusy(false);
    }
  }

  const info = view.kind === 'ready' ? view.info : null;
  return (
    <div className="auth single">
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-logo small"><Logo width={150} /></div>
          <p className="auth-product small">Product Analytics</p>
          {view.kind === 'checking' && <p className="muted" role="status">Checking your link…</p>}
          {view.kind === 'bad' && (
            <>
              <h2>This link does not work</h2>
              <p role="alert">{view.message}</p>
              <p className="muted">Links work once and expire after 72 hours. Ask an admin to send you a new one.</p>
              <p><Link href="/login">Go to sign in</Link></p>
            </>
          )}
          {info && (
            <form onSubmit={submit}>
              <h2>{info.purpose === 'invite' ? `Welcome, ${info.name}` : 'Choose a new password'}</h2>
              <p className="muted">
                {info.purpose === 'invite'
                  ? 'Choose a password to finish setting up your account. You will be signed in straight away.'
                  : `Set a new password for ${info.name}. Any device signed in with the old password will be signed out.`}
              </p>
              <label htmlFor="who">Your email</label>
              <input id="who" type="email" value={info.email} readOnly aria-readonly="true" autoComplete="username" />
              <label htmlFor="pw">New password</label>
              <PasswordInput id="pw" autoComplete="new-password" minLength={MIN_PASSWORD} autoFocus value={password} onChange={setPassword} />
              <PasswordRule value={password} />
              <label htmlFor="pw2">Type it again</label>
              <PasswordInput id="pw2" autoComplete="new-password" minLength={MIN_PASSWORD} value={again} onChange={setAgain} />
              {error && <p className="error" role="alert">{error}</p>}
              <p><button className="primary wide" disabled={busy || password.length < MIN_PASSWORD}>{busy ? 'Saving…' : info.purpose === 'invite' ? 'Set password and sign in' : 'Save password and sign in'}</button></p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
