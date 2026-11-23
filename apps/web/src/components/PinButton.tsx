'use client';

import { Icon } from './Icon';
import { useLayout } from '@/lib/layout';

/** Adds a card to the person's Overview, or takes it off again. */
export function PinButton({ cardKey, label }: { cardKey: string; label: string }) {
  const { has, toggle, ready } = useLayout();
  const on = has(cardKey);
  const text = on ? `Remove ${label} from your dashboard` : `Add ${label} to your dashboard`;
  return (
    <button type="button" className={`pin${on ? ' on' : ''}`} aria-pressed={on} aria-label={text} title={on ? 'On your dashboard. Click to remove.' : 'Add to dashboard'} disabled={!ready} onClick={() => toggle(cardKey)}>
      <Icon name={on ? 'check' : 'plus'} size={15} />
    </button>
  );
}
