'use client';

import { Hint } from '@/components/Hint';
import { Icon } from '@/components/Icon';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { api, type AdminUser, type LinkResult, type Role } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/date';

const ROLES: Role[] = ['viewer', 'editor', 'admin'];

type Shown = { name: string; purpose: 'invite' | 'reset'; url: string; expiresAt: string };

function statusText(u: AdminUser) {
  if (u.status === 'deactivated') return { label: 'Deactivated', tone: 'off', note: '' };
  if (u.status === 'invited') {
    return u.link && !u.link.expired
      ? { label: 'Invited', tone: 'wait', note: `link works until ${fmtDate(u.link.expiresAt)}` }
      : { label: 'Invite expired', tone: 'off', note: 'make a new link' };
  }
  if (u.link && !u.link.expired) return { label: 'Active', tone: 'ok', note: `reset link works until ${fmtDate(u.link.expiresAt)}` };
  return { label: 'Active', tone: 'ok', note: '' };
}

export default function UsersPage() {
  const { user: me, loading } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');
  const [shown, setShown] = useState<Shown | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'viewer' as Role });

  const load = useCallback(async () => {
    try {
      setUsers(await api<AdminUser[]>('/users'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    }
  }, []);

  useEffect(() => {
    if (me?.role === 'admin') load();
  }, [me, load]);

  async function run(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  }

  // The link carries a one-time token in the #fragment. It is shown once; only a hash is stored.
  const show = (r: LinkResult) => {
    setCopied(false);
    setShown({
      name: r.user.name,
      purpose: r.purpose,
      url: `${window.location.origin}/accept-invite#token=${r.token}`,
      expiresAt: r.user.link?.expiresAt ?? '',
    });
  };

  async function invite(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      show(await api<LinkResult>('/users', { method: 'POST', body: form }));
      setForm({ name: '', email: '', role: 'viewer' });
    });
  }

  async function copy() {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(shown.url);
      setCopied(true);
    } catch {
      document.querySelector<HTMLInputElement>('#link-url')?.select(); // no clipboard access: select it so Ctrl+C works
    }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (me?.role !== 'admin') return <p>Admins only.</p>;

  return (
    <>
      <h1>Users</h1>
      <Hint>Who can sign in. <b>Viewer</b> can only look. <b>Editor</b> can also add findings, notes and chart markers. <b>Admin</b> can also manage users and data sources. You never set anyone&apos;s password: add them, then send them a one-time link so they choose their own. Deactivate a person instead of deleting them to keep their history.</Hint>
      {error && <p className="error" role="alert">{error}</p>}

      {shown && (
        <div className="card link-card" role="status">
          <strong>{shown.purpose === 'invite' ? `Invite link for ${shown.name}` : `Password reset link for ${shown.name}`}</strong>
          <p className="muted">
            Send this to {shown.name} yourself, for example in a chat message. It works once and expires on {fmtDate(shown.expiresAt)}.
            <b> It is shown only now.</b> If you lose it, make a new one.
          </p>
          <div className="row">
            <input id="link-url" type="text" readOnly value={shown.url} onFocus={(e) => e.currentTarget.select()} aria-label="One-time link" />
            <button className="primary" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? 'Copied' : 'Copy link'}</button>
            <button onClick={() => setShown(null)}>Done</button>
          </div>
        </div>
      )}

      <form className="card" onSubmit={invite}>
        <strong>Add a person</strong>
        <p className="muted">Enter who they are and what they may do. You get a one-time link to send them; they choose their own password.</p>
        <div className="form-grid">
          <label className="field"><span>Name</span>
            <input type="text" placeholder="Full name" required autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field"><span>Email</span>
            <input type="email" placeholder="name@company.com" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field"><span>Role</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <button className="primary"><Icon name="link" size={14} />Create invite link</button>
        </div>
      </form>

      <div className="table-scroll"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
        <tbody>
          {users.map((u) => {
            const self = u.id === me.id;
            const st = statusText(u);
            return (
              <tr key={u.id}>
                <td>{u.name}{self && <span className="muted"> (you)</span>}</td>
                <td>{u.email}</td>
                <td>
                  <select aria-label={`Role for ${u.name}`} value={u.role} disabled={self} onChange={(e) => run(() => api(`/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } }))}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td><span className={`status ${st.tone}`}>{st.label}</span>{st.note && <span className="muted status-note">{st.note}</span>}</td>
                <td className="muted">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</td>
                <td>
                  <div className="row">
                    <button disabled={self} onClick={() => run(() => api(`/users/${u.id}`, { method: 'PATCH', body: { active: u.status === 'deactivated' } }))}>
                      {u.status === 'deactivated' ? 'Activate' : 'Deactivate'}
                    </button>
                    {u.status !== 'deactivated' && (
                      <button onClick={() => run(async () => show(await api<LinkResult>(`/users/${u.id}/link`, { method: 'POST' })))}>
                        <Icon name="link" size={14} />{u.status === 'invited' ? 'New invite link' : 'Reset password link'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </>
  );
}
