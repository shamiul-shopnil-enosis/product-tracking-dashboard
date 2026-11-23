import type { ReactNode } from 'react';
import { Tip } from './Tip';

/** Page title with its one-line purpose, and any longer guidance, behind an "i" next to the title. */
export function PageHead({ title, children, more, actions }: { title: string; children?: ReactNode; more?: ReactNode; /** Buttons on the right of the title */ actions?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>
        {title}
        {(children || more) && (
          <> <Tip label={title} side="left" wide>
            {children && <span className="tp">{children}</span>}
            {more && <span className="tp">{more}</span>}
          </Tip></>
        )}
      </h1>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
