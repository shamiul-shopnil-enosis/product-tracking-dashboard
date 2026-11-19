'use client';

import { formatValue, type Tile as TileData } from '@/lib/dashboard';
import { Delta } from './Delta';
import { Tip } from './Tip';
import { Spark } from './Spark';
import { Icon, metricStyle } from './Icon';

/** A metric: value, change against the previous period, trend line and and a plain-language definition that is always shown. */
export function Tile({ tile, spark, color, compact: _compact = true }: { tile: TileData; spark?: (number | null)[]; color?: string; /** Definition as an "i" tooltip instead of always-visible text */ compact?: boolean }) {
  const { icon, accent } = metricStyle(tile.key, tile.label);
  return (
    <div className="tile"style={{ ['--accent' as string]: accent }}>
      <div className="tile-top">
        <span className="tile-label"><span className="tile-ico"><Icon name={icon} size={15} /></span>{tile.label}</span>
        <Tip label={tile.label}>{tile.help}</Tip>
      </div>
      <div className="tile-value">{formatValue(tile.value, tile.unit)}</div>
      <div className="tile-bottom">
        <Delta change={tile.change} trend={tile.trend} />
        {spark && <span className="spark"><Spark values={spark} color={color} /></span>}
      </div>
      {tile.previous !== null && <div className="prev">before: {formatValue(tile.previous, tile.unit)}</div>}
    </div>
  );
}
