'use client';

import { useState } from 'react';
import { Icon } from './Icon';

export const MIN_PASSWORD = 10;

/** A password box with a show/hide button and a caps-lock warning. */
export function PasswordInput({
  id, value, onChange, autoComplete, placeholder, minLength, required = true, autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
  minLength?: number;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  return (
    <>
      <span className="pw">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={minLength}
          required={required}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))}
          onKeyDown={(e) => setCaps(e.getModifierState('CapsLock'))}
          onBlur={() => setCaps(false)}
        />
        <button type="button" className="pw-toggle" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
          <Icon name={shown ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </span>
      {caps && <span className="field-note warn" role="status">Caps Lock is on</span>}
    </>
  );
}

/** "At least 10 characters", turning green once met. */
export function PasswordRule({ value }: { value: string }) {
  const ok = value.length >= MIN_PASSWORD;
  return (
    <span className={`field-note${ok ? ' ok' : ''}`}>
      {ok ? <Icon name="check" size={14} /> : <span aria-hidden="true">•</span>} At least {MIN_PASSWORD} characters{value && !ok ? ` (${value.length} so far)` : ''}
    </span>
  );
}
