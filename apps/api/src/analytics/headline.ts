export interface HeadlineTile {
  key: string;
  change: number | null;
  trend: string;
  sample?: number | null;
}

// How each metric reads in a sentence.
const PHRASE: Record<string, string> = {
  sessions: 'human sessions',
  users: 'visitors',
  botShare: 'the bot share',
  pagesPerSession: 'pages per session',
  scrollDepth: 'scroll depth',
  activeTime: 'active time',
  quickback: 'quick backs',
  dead: 'dead clicks',
  rage: 'rage clicks',
  scriptError: 'script errors',
  ga4Sessions: 'GA4 sessions',
  ga4Users: 'GA4 active users',
  ga4Engagement: 'GA4 engagement rate',
  ga4KeyEvents: 'GA4 key events',
};

const GOOD_MIN = 5; // percent
const BAD_MIN = 4;
const MIN_SAMPLE = 10;

const say = (t: HeadlineTile) => `${PHRASE[t.key] ?? t.key} ${(t.change ?? 0) > 0 ? 'up' : 'down'} ${Math.abs(Math.round(t.change ?? 0))}%`;
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** One plain sentence that answers "is the product improving?" from the tiles. */
/** `against` is the number of days in the previous period, or a phrase when the comparison is a custom period. */
export function buildHeadline(tiles: HeadlineTile[], against: number | string): string {
  const vs = typeof against === 'number' ? `the previous ${against} days` : against;
  if (tiles.length === 0) return '';
  if (tiles.every((t) => t.change === null)) return `Not enough history yet to compare with ${vs}.`;

  const big = (t: HeadlineTile) => Math.abs(t.change ?? 0);
  const good = tiles.filter((t) => t.trend === 'better' && big(t) >= GOOD_MIN).sort((a, b) => big(b) - big(a)).slice(0, 2);
  const bad = tiles
    .filter((t) => t.trend === 'worse' && big(t) >= BAD_MIN && (t.sample == null || t.sample >= MIN_SAMPLE))
    .sort((a, b) => big(b) - big(a))
    .slice(0, 2);

  if (!good.length && !bad.length) return `Nothing moved much compared with ${vs}.`;
  const goodText = list(good.map(say));
  const cap = goodText.charAt(0).toUpperCase() + goodText.slice(1);
  if (good.length && !bad.length) return `Looking good: ${goodText}, with nothing getting worse.`;
  if (!good.length) return `Watch ${list(bad.map(say))}.`;
  return `${cap}. But watch ${list(bad.map(say))}.`;
}

/**
 * A second sentence that says what the changes probably mean, for readers who will not work it out themselves.
 * Only fires on patterns that are well known to mislead: traffic growth that is not engaged.
 */
export function buildInsight(tiles: HeadlineTile[]): string {
  const change = (k: string) => tiles.find((t) => t.key === k)?.change ?? null;
  const traffic = Math.max(change('ga4Sessions') ?? -Infinity, change('sessions') ?? -Infinity);
  const engagement = change('ga4Engagement');
  if (traffic >= 20 && engagement !== null && engagement <= -4) {
    return 'Visits are growing but fewer of them are engaged, which usually means more automated traffic rather than more real interest. Check the bot share and the Traffic page before celebrating the growth.';
  }
  const bot = change('botShare');
  if (bot !== null && bot >= 20 && (change('sessions') ?? 0) <= 5) {
    return 'The bot share rose while real visits did not, so a traffic jump in the raw numbers is probably not real people.';
  }
  return '';
}
