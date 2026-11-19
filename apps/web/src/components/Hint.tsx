import type { ReactNode } from 'react';

/** A short, always-visible plain-language explanation. Used under every section so nobody has to guess. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="hint">
      <span className="hint-i" aria-hidden>i</span>
      <span>{children}</span>
    </p>
  );
}

export type GuideItem = { term: string; text: string };

/** "How to read this table": one line per column, open by default, collapsible once you know it. */
export function Guide({ title = 'What the columns mean', items }: { title?: string; items: GuideItem[] }) {
  return (
    <details className="guide" open>
      <summary>{title}</summary>
      <dl>
        {items.map((i) => (
          <div key={i.term}>
            <dt>{i.term}</dt>
            <dd>{i.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
