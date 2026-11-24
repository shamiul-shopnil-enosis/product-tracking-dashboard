'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { filterQuery, useFilters } from '@/lib/filters';
import { formatValue, type Tile as TileData } from '@/lib/dashboard';
import { Delta } from './Delta';
import { Tip } from './Tip';
import { PinButton } from './PinButton';
import { AnimatedNumber } from './AnimatedNumber';
import { Spark } from './Spark';
import { Icon, metricStyle } from './Icon';
import { BAND_COLOR, bandOf } from '@/lib/change';
import { SourceIcon } from './SourceIcon';

/** A metric: value, change against the previous period, trend line and and a plain-language definition that is always shown. */
export function Tile({ tile, spark, color: _color, compact: _compact = true }: { tile: TileData; spark?: (number | null)[]; color?: string; /** Definition as an "i" tooltip instead of always-visible text */ compact?: boolean }) {
  const { icon } = metricStyle(tile.key, tile.label);
  const name = tile.label.replace(/\s*\((GA4|Clarity)\)$/i, ''); // the source chip says it already
  const sp = useSearchParams();
  const { compare } = useFilters();
  const band = compare ? bandOf(tile.change, tile.trend) : 'flat';
  const edge = BAND_COLOR[band];
  const href = `/metric/${tile.key}${filterQuery(new URLSearchParams(sp.toString()))}`;
  return (
    <div className={`tile clickable band-${band}`} style={{ ['--accent' as string]: edge }}>
      <div className="tile-top">
        <span className="tile-label"><span className="tile-ico"><Icon name={icon} size={15} /></span><span className="tile-name"><Link href={href} className="tile-link">{name}</Link>{tile.source && <SourceIcon source={tile.source} />}</span></span>
        <span className="tile-tools"><PinButton cardKey={tile.key} label={name} /><Tip label={name}>{tile.help}</Tip></span>
      </div>
      <div className="tile-value"><AnimatedNumber value={tile.value} format={(v) => formatValue(v, tile.unit)} /></div>
      <div className="tile-bottom">
        {compare ? <Delta change={tile.change} trend={tile.trend} /> : <span />}
        {spark && <span className="spark"><Spark values={spark} color={band === 'flat' ? 'var(--ink-3)' : edge} /></span>}
      </div>
      {compare && tile.previous !== null ? <div className="prev">before: {formatValue(tile.previous, tile.unit)}</div> : <div className="prev" aria-hidden="true" />}
    </div>
  );
}
