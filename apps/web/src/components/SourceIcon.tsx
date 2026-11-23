import { SOURCE_LABEL } from '@/lib/change';

/** The mark of the tool a number comes from, so a card needs no text label for it. */
export function SourceIcon({ source, size = 16 }: { source: 'clarity' | 'ga4'; size?: number }) {
  const name = SOURCE_LABEL[source];
  return (
    <span className="src-ico" role="img" aria-label={`Data from ${name}`} title={`Data from ${name}`}>
      {source === 'ga4' ? (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="15.5" y="2" width="6" height="20" rx="3" fill="#F9AB00" />
          <rect x="9" y="9" width="6" height="13" rx="3" fill="#E37400" />
          <circle cx="4.5" cy="19" r="3" fill="#E37400" />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="1" y="1" width="22" height="22" rx="6" fill="#0F6CBD" />
          <path d="M16.5 8.2A6 6 0 1 0 16.5 15.8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="17" cy="12" r="1.6" fill="#fff" />
        </svg>
      )}
    </span>
  );
}
