import logo from '@/assets/enosis-logo.png';

/** The Enosis Outsourcing logo. It has dark text, so dark theme and coloured panels give it a light chip (see .enosis-logo in the css). */
export function Logo({ width = 120, chip = false, className = '' }: { width?: number; chip?: boolean; className?: string }) {
  return (
    <span className={`enosis-logo${chip ? ' chip' : ''}${className ? ` ${className}` : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo.src} width={width} height={Math.round((width * logo.height) / logo.width)} alt="Enosis Outsourcing" />
    </span>
  );
}
