'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { Icon } from './Icon';
import { switchProfile } from '@/lib/profile';

/** The profile in use, with a list to switch. Always one click (or the W key) away. */
export function ProfileSwitcher() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const profiles = user?.profiles ?? [];
  const active = profiles.find((p) => p.id === user?.activeProfileId) ?? profiles[0];

  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener('pt-open-profiles', openIt);
    return () => window.removeEventListener('pt-open-profiles', openIt);
  }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector<HTMLElement>('button')?.focus(); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    box.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!active) return null;
  // One profile and nobody to add another: just show its name.
  if (profiles.length < 2 && !user?.superAdmin) return <div className="profile-name" title="Profile">{active.name}</div>;

  return (
    <div className="profile-switch" ref={box}>
      <button type="button" className="profile-btn" aria-haspopup="menu" aria-expanded={open} title="Switch profile (W)" onClick={() => setOpen((v) => !v)}>
        <span className="profile-dot" aria-hidden>{active.name.slice(0, 1).toUpperCase()}</span>
        <span className="profile-label"><small>Profile</small>{active.name}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="profile-menu" role="menu" aria-label="Profiles">
          {profiles.map((p) => (
            <button key={p.id} type="button" role="menuitemradio" aria-checked={p.id === active.id} className="profile-item"
              onClick={() => (p.id === active.id ? setOpen(false) : switchProfile(p.id))}>
              <span className="profile-dot" aria-hidden>{p.name.slice(0, 1).toUpperCase()}</span>
              <span className="profile-label">{p.name}<small>{p.role}</small></span>
              {p.id === active.id && <Icon name="check" size={15} />}
            </button>
          ))}
          {user?.superAdmin && <Link href="/admin/data" className="profile-manage" onClick={() => setOpen(false)}>Manage profiles…</Link>}
        </div>
      )}
    </div>
  );
}
