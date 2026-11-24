'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { filterQuery } from '@/lib/filters';

/** Where "g" then a letter goes. The dates in the address come along. */
export const GO_TO: { key: string; label: string; href: string; filters: boolean }[] = [
  { key: 'o', label: 'Overview', href: '/', filters: true },
  { key: 'g', label: 'Google Analytics', href: '/ga4', filters: true },
  { key: 'c', label: 'Clarity', href: '/clarity', filters: true },
  { key: 't', label: 'Traffic', href: '/traffic', filters: true },
  { key: 'p', label: 'Pages', href: '/pages', filters: true },
  { key: 'e', label: 'SEO', href: '/seo', filters: true },
  { key: 'a', label: 'Audience', href: '/audience', filters: true },
  { key: 'f', label: 'Friction', href: '/friction', filters: true },
  { key: 'v', label: 'Core Web Vitals', href: '/speed', filters: false },
  { key: 'i', label: 'Findings', href: '/findings', filters: false },
  { key: 'h', label: 'How to read this', href: '/help', filters: false },
];

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

export function ShortcutList() {
  return (
    <table className="keys">
      <tbody>
        <tr><th scope="row"><kbd>/</kbd></th><td>Find a card (on the Google Analytics page)</td></tr>
        <tr><th scope="row"><kbd>?</kbd></th><td>Show this list</td></tr>
        {GO_TO.map((g) => <tr key={g.key}><th scope="row"><kbd>g</kbd> <kbd>{g.key}</kbd></th><td>Go to {g.label}</td></tr>)}
        <tr><th scope="row"><kbd>Esc</kbd></th><td>Close a window or menu</td></tr>
      </tbody>
    </table>
  );
}

/** Keyboard shortcuts for the whole app. They stay out of the way while someone is typing or a window is open. */
export function Shortcuts() {
  const router = useRouter();
  const toast = useToast();
  const [help, setHelp] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    const disarm = () => { armed.current = false; if (pending.current) clearTimeout(pending.current); pending.current = null; };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || typing(e.target)) return;
      if (document.querySelector('[role=dialog]') && e.key !== '?') return;
      if (armed.current) {
        const hit = GO_TO.find((g) => g.key === e.key.toLowerCase());
        disarm();
        if (hit) { e.preventDefault(); router.push(hit.href + (hit.filters ? filterQuery(new URLSearchParams(window.location.search)) : '')); }
        return;
      }
      if (e.key === 'g') { armed.current = true; pending.current = setTimeout(disarm, 1200); return; }
      if (e.key === '?') { e.preventDefault(); setHelp((v) => !v); return; }
      if (e.key === '/') {
        const box = document.querySelector<HTMLInputElement>('[data-search]');
        if (box) { e.preventDefault(); box.focus(); box.select(); }
        else toast('There is no search on this page. Press g then g for the Google Analytics cards.', { tone: 'info' });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); disarm(); };
  }, [router, toast]);

  return <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts"><ShortcutList /><p className="muted">Shortcuts work when you are not typing in a field.</p></Modal>;
}
