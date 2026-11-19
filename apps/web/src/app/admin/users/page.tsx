'use client';

import { Hint } from '@/components/Hint';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { api, type Role, type User } from '@/lib/api';

const ROLES: Role[] = ['viewer', 'editor', 'admin'];

export default function UsersPage() {
  const { user: me, loading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' as Role });

  const load = useCallback(async () => {
    try {
      setUsers(await api<User[]>('/users'));
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

  async function create(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api('/users', { method: 'POST', body: form });
      setForm({ name: '', email: '', password: '', role: 'viewer' });
    });
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (me?.role !== 'admin') return <p>Admins only.</p>;

  return (
    <>
      <h1>Users</h1>
      <Hint>Who can sign in. <b>Viewer</b> can only look. <b>Editor</b> can also add findings, notes and chart markers. <b>Admin</b> can also manage users and data sources. Deactivate a person instead of deleting them to keep their history.</Hint>
      {error && <p className="error" role="alert">{error}</p>}

      <form className="card" onSubmit={create}>
        <strong>Add user</strong>
        <div className="row">
          <input type="text" placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input type="password" placeholder="Password (min 10)" required minLength={10} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
          <button className="primary">Create</button>
        </div>
      </form>

      <div className="table-scroll"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
        <tbody>
          {users.map((u) => {
            const self = u.id === me.id;
            return (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} disabled={self} onChange={(e) => run(() => api(`/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } }))}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td>{u.active ? 'Active' : 'Deactivated'}</td>
                <td>
                  <div className="row">
                    <button disabled={self} onClick={() => run(() => api(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }))}>
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                    {resetFor === u.id ? (
                      <>
                        <input type="password" placeholder="New password (min 10)" minLength={10} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                        <button className="primary" disabled={newPassword.length < 10} onClick={() => run(async () => {
                          await api(`/users/${u.id}/password`, { method: 'POST', body: { password: newPassword } });
                          setResetFor(null);
                          setNewPassword('');
                        })}>Save</button>
                        <button onClick={() => { setResetFor(null); setNewPassword(''); }}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => { setResetFor(u.id); setNewPassword(''); }}>Reset password</button>
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
