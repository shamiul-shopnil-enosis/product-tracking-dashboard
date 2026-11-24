'use client';

import type { MouseEvent } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { useLayout } from '@/lib/layout';
import { prefersReducedMotion } from '@/lib/motion';

/** Adds a card to the person's Overview, or takes it off again. A card removed on the Overview fades out first. */
export function PinButton({ cardKey, label }: { cardKey: string; label: string }) {
  const { has, toggle, ready } = useLayout();
  const toast = useToast();
  const onOverview = usePathname() === '/';
  const on = has(cardKey);
  const text = on ? `Remove ${label} from your dashboard` : `Add ${label} to your dashboard`;

  function click(e: MouseEvent<HTMLButtonElement>) {
    const wasOn = on;
    const card = e.currentTarget.closest('.tile');
    const finish = () => {
      toggle(cardKey);
      toast(wasOn ? `Removed “${label}” from your Overview` : `Added “${label}” to your Overview`, {
        action: { label: 'Undo', onClick: () => toggle(cardKey) },
      });
    };
    if (wasOn && onOverview && card && !prefersReducedMotion()) {
      card.classList.add('leaving');
      setTimeout(finish, 170);
    } else finish();
  }

  return (
    <button type="button" className={`pin${on ? ' on' : ''}`} aria-pressed={on} aria-label={text} title={on ? 'On your dashboard. Click to remove.' : 'Add to dashboard'} disabled={!ready} onClick={click}>
      <Icon name={on ? 'check' : 'plus'} size={15} />
    </button>
  );
}
