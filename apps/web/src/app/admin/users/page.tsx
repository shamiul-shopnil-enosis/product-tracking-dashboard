'use client';

import { Hint } from '@/components/Hint';
import { Icon } from '@/components/Icon';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Modal } from '@/components/Modal';
import { api, type AdminUser, type LinkResult, type Role } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/date';

const ROLES: Role[] = ['viewer', 'editor', 'admin'];
type ProfileRow = { id: string; name: string; isDefault: boolean };

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
  const [form, setForm] = useState({ name: '', email: '', role: 'viewer' as Role, superAdmin: false });
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [pick, setPick] = useState<string[]>([]);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [draft, setDraft] = useState<Record<string, Role | ''>>({});
  const [draftSuper, setDraftSuper] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, p] = await Promise.all([api<AdminUser[]>('/users'), api<ProfileRow[]>('/profiles/all')]);
      setUsers(u); setProfiles(p);
      setPick((cur) => (cur.length ? cur : p.filter((x) => x.id === me?.activeProfileId).map((x) => x.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    }
  }, []);

  useEffect(() => {
    if (me?.superAdmin) load();
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
      show(await api<LinkResult>('/users', { method: 'POST', body: { ...form, profileIds: pick } }));
      setForm({ name: '', email: '', role: 'viewer', superAdmin: false });
    });
  }

  function openAccess(u: AdminUser) {
    const d: Record<string, Role | ''> = {};
    for (const p of profiles) d[p.id] = u.memberships?.find((m) => m.profileId === p.id)?.role ?? '';
    setDraft(d); setDraftSuper(u.superAdmin === true); setEditing(u);
  }
  async function saveAccess() {
    if (!editing) return;
    const memberships = profiles.filter((p) => draft[p.id]).map((p) => ({ profileId: p.id, role: draft[p.id] as Role }));
    await run(async () => {
      await api(`/users/${editing.id}/access`, { method: 'PUT', body: { memberships } });
      if (draftSuper !== (editing.superAdmin === true)) await api(`/users/${editing.id}`, { method: 'PATCH', body: { superAdmin: draftSuper } });
    });
    setEditing(null);
  }
  const accessText = (u: AdminUser) => {
    if (u.superAdmin) return 'All profiles (super admin)';
    const parts = (u.memberships ?? []).map((m) => { const p = profiles.find((x) => x.id === m.profileId); return p ? `${p.name} (${m.role})` : null; }).filter(Boolean);
    return parts.length ? parts.join(', ') : 'No profile yet';
  };

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
  if (!me?.superAdmin) return <p>Only super admins manage users and profile access.</p>;

  return (
    <>
      <h1>Users</h1>
      <Hint>Who can sign in, and which profiles each person may open. In each profile a person is a <b>Viewer</b> (can only look), an <b>Editor</b> (can also add findings, notes and chart markers) or an <b>Admin</b> (can also manage that profile&apos;s data sources). A <b>super admin</b> opens every profile as admin and is the only one who can create profiles, save keys and manage users. You never set anyone&apos;s password: add them, then send them a one-time link so they choose their own. Deactivate a person instead of deleting them to keep their history.</Hint>
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
          <label className="field"><span>Role in those profiles</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <button className="primary"><Icon name="link" size={14} />Create invite link</button>
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: '8px 0 0' }}>
          <legend className="muted">Can open</legend>
          <div className="row">
            {profiles.map((p) => (
              <label key={p.id} style={{ margin: 0 }}><input type="checkbox" checked={pick.includes(p.id)} onChange={(e) => setPick(e.target.checked ? [...pick, p.id] : pick.filter((x) => x !== p.id))} /> {p.name}</label>
            ))}
            <label style={{ margin: 0 }}><input type="checkbox" checked={form.superAdmin} onChange={(e) => setForm({ ...form, superAdmin: e.target.checked })} /> Super admin</label>
          </div>
        </fieldset>
      </form>

      <div className="table-scroll"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
        <tbody>
          {users.map((u) => {
            const self = u.id === me.id;
            const st = statusText(u);
            return (
              <tr key={u.id}>
                <td>{u.name}{self && <span className="muted"> (you)</span>}</td>
                <td>{u.email}</td>
                <td>{accessText(u)} <button type="button" className="link" onClick={() => openAccess(u)}>Edit access</button></td>
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
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Access for ${editing.name}` : 'Access'}>
        <p className="muted">Tick the profiles this person may open and choose their role in each.</p>
        {profiles.map((p) => (
          <div className="access-row" key={p.id}>
            <input type="checkbox" id={`acc-${p.id}`} checked={!!draft[p.id]} onChange={(e) => setDraft({ ...draft, [p.id]: e.target.checked ? 'viewer' : '' })} />
            <label htmlFor={`acc-${p.id}`}>{p.name}</label>
            <select aria-label={`Role in ${p.name}`} disabled={!draft[p.id]} value={draft[p.id] || 'viewer'} onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        ))}
        <label style={{ marginTop: 10 }}><input type="checkbox" checked={draftSuper} disabled={editing?.id === me?.id} onChange={(e) => setDraftSuper(e.target.checked)} /> Super admin (opens every profile, manages profiles, keys and users)</label>
        <p className="row" style={{ marginTop: 14 }}><button className="primary" onClick={() => void saveAccess()}>Save access</button><button onClick={() => setEditing(null)}>Cancel</button></p>
      </Modal>
    </>
  );
}
