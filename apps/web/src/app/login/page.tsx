'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { PasswordInput } from '@/components/PasswordInput';
import { api, ApiError, type LoginContext } from '@/lib/api';
import { fmtDate } from '@/lib/date';

const NOTICES: Record<string, string> = {
  ended: 'Your session ended. Please sign in again to continue.',
  signedout: 'You have been signed out.',
};

const POINTS = [
  { title: 'Traffic and search', text: 'Visitors, where they come from and how many arrive from search.' },
  { title: 'Friction', text: 'Where people get stuck: rage clicks, dead clicks and errors.' },
  { title: 'Findings', text: 'A shared list of what the team found and still has to fix.' },
];

function LoginForm() {
  const router = useRouter();
  const reason = useSearchParams().get('reason') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState<LoginContext | null>(null);

  useEffect(() => {
    api<LoginContext>('/health/context').then(setCtx).catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  const contact = ctx?.accessContact;
  return (
    <div className="auth">
      <section className="auth-brand" aria-label="About this dashboard">
        <div className="auth-logo"><Logo width={170} chip /></div>
        <p className="auth-product">Product Analytics</p>
        <h1>See how the product is doing, in plain words.</h1>
        <p className="auth-lead">One place for the team to read website and app data from Google Analytics and Microsoft Clarity. No analytics skills needed.</p>
        <ul className="auth-points">
          {POINTS.map((p) => <li key={p.title}><b>{p.title}</b><span>{p.text}</span></li>)}
        </ul>
        <p className="auth-fresh">{ctx?.dataUpdatedAt ? `Data updates every night. Last updated ${fmtDate(ctx.dataUpdatedAt)}.` : 'Data updates every night.'}</p>
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="muted">Use the account your admin set up for you.</p>
          {NOTICES[reason] && !error && <p className="notice" role="status">{NOTICES[reason]}</p>}
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={setPassword} />
          {error && <p className="error" role="alert">{error}</p>}
          <p><button className="primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></p>
          <p className="auth-help">
            <b>No account, or forgot your password?</b>{' '}
            {contact ? (
              <>Ask an admin: {/^\S+@\S+$/.test(contact) ? <a href={`mailto:${contact}`}>{contact}</a> : contact}. They can send you a link.</>
            ) : (
              <>Ask your admin. They can send you a link to set a password.</>
            )}
          </p>
          <p className="auth-help muted">Got an invite link? Open it from your message. <Link href="/help">How to read this dashboard</Link></p>
        </form>
      </section>
    </div>
  );
}

export default function Login() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
