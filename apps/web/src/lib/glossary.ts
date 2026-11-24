import type { GuideItem } from '@/components/Hint';

/** One plain-language definition per metric, reused by every table so the wording never drifts. */
export const G = {
  sessions: { term: 'Sessions', text: 'One visit to the site, from arriving to leaving. One person visiting twice counts as two sessions.' },
  share: { term: 'Share', text: 'This row’s part of all sessions in the range. The bar is only a visual aid; the percentage is the number.' },
  change: { term: 'Per day vs before', text: 'Sessions per day in this range compared with sessions per day in the equal-length range just before it. Up arrow = more traffic, down arrow = less. A dash means there was nothing to compare with.' },
  botShare: { term: 'Bot share', text: 'Of all sessions in this row, the part that came from automated programs (bots) rather than people. High means this row is mostly not real visitors.' },
  pagesPerSession: { term: 'Pages / session', text: 'How many pages a visitor looks at in one visit. Higher means they keep exploring; about 1 means they leave after the first page.' },
  scroll: { term: 'Scroll', text: 'On average, how far down the page visitors scroll, as a share of the page height. 100% means they reach the bottom.' },
  activeTime: { term: 'Active time', text: 'Average time visitors actually spend on the page (clicking, scrolling, typing), not counting an idle open tab.' },
  quickBacks: { term: 'Quick backs', text: 'Visitors who arrive on a page and go straight back to the previous page. A high rate often means the page was not what they expected, or it was hard to use.' },
  deadClicks: { term: 'Dead clicks', text: 'Clicks or taps that did nothing. Visitors expected something to happen, such as a button or image that is not clickable.' },
  rageClicks: { term: 'Rage clicks', text: 'Several fast clicks in the same spot. A strong sign of frustration, for example a broken button or a slow page.' },
  scriptErrors: { term: 'Script errors', text: 'The page’s code failed while the visitor was using it. Something on the page may not have worked.' },
  engagement: { term: 'Engagement rate', text: 'Share of sessions that were real visits: longer than 10 seconds, or at least 2 pages, or a key event. A very low rate on a big source suggests automated traffic.' },
  recordings: { term: 'Recordings', text: 'Open takes you to the recordings of exactly this page in Clarity (a new tab), going back as far as the dates chosen at the top. Clarity keeps recordings for 30 days. The filter is “Visited URL is exactly”, so visits to the same page with extra text on the address may be missing; change the filter in Clarity to “contains” to include them.' },
  findings: { term: 'Findings', text: 'Issues your team has logged for this page. Click to open them.' },
  friction: { term: 'Number (percent)', text: 'In the friction columns, the number is how many sessions were affected and the percent is that number as a share of the page’s sessions.' },
} satisfies Record<string, GuideItem>;
