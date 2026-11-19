import type { ReactNode } from 'react';
import { Tip } from './Tip';

/** Plain-language help for a section. Lives behind an "i" so the page stays clean. */
export function Hint({ children, label = 'About this section' }: { children: ReactNode; label?: string }) {
  return (
    <p className="hint">
      <Tip label={label} side="left">{children}</Tip>
      <span className="hint-label">{label}</span>
    </p>
  );
}

export type GuideItem = { term: string; text: string };

/** "What the columns mean": one line per column, behind an "i". */
export function Guide({ title = 'What the columns mean', items }: { title?: string; items: GuideItem[] }) {
  return (
    <p className="hint">
      <Tip label={title} side="left" wide>
        {items.map((i) => (
          <span className="tp" key={i.term}><b>{i.term}</b>: {i.text}</span>
        ))}
      </Tip>
      <span className="hint-label">{title}</span>
    </p>
  );
}
