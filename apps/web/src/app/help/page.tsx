const METRICS: Array<[string, string]> = [
  ['Human sessions per day', 'The average number of human visits per day. Clarity counts bot sessions separately, so this figure is people only.'],
  ['Bot share', 'Bot sessions as a share of all sessions. Most of the traffic to the public site is automated, so this is high. A sudden jump explains a sudden jump in traffic. It is not a quality signal.'],
  ['Visitors per day', 'The average of each day’s distinct visitors. The same person on two days counts twice, so do not read it as unique people for the whole range.'],
  ['Pages per session', 'How many pages a visit looks at. 1 means most people see one page and leave, which is normal for visitors who arrive from search.'],
  ['Scroll depth', 'How far down the page people get, on average. 38% means the average visitor never sees the bottom half.'],
  ['Active time per session', 'Seconds of real interaction (scrolling, clicking, typing), not the time the tab was open.'],
  ['Quick-back sessions', 'Visits where someone opened a page, left almost at once and went back. A high share often means the page was not what they expected.'],
  ['Dead-click sessions', 'Visits with a click on something that did nothing. It can be a button that looks clickable but is not, or one that is slow to respond.'],
  ['Rage-click sessions', 'Visits with several rapid clicks in the same place, which usually means frustration.'],
  ['Script-error sessions', 'Visits that hit a JavaScript error in the page.'],
  ['Sessions per day (GA4)', 'Visits per day as counted by Google Analytics. It only removes bots it recognises, so it is usually higher than Clarity’s human sessions.'],
  ['Active users per day (GA4)', 'People who actively used the site each day, averaged. The same person on two days counts twice.'],
  ['Engagement rate (GA4)', 'Share of visits that lasted over 10 seconds, viewed 2+ pages or had a key event. A very low rate on a large channel suggests automated visits.'],
  ['Key events per day (GA4)', 'How often visitors did something you marked as important in Google Analytics, such as signing up.'],
  ['Channel', 'The kind of source a visit came from: search, direct (no referrer known), social, referral and so on.'],
  ['Landing page', 'The first page of a visit. Only GA4 can tell this.'],
  ['Organic search', 'Visits that arrived by clicking a search engine result (not an ad). GA4 can tell how many, but not which words were typed or where the page ranked.'],
  ['Organic share of traffic', 'The part of all visits that came from search. It moves when other traffic changes, so it has no good or bad colour; judge search by organic sessions per day.'],
  ['Audience', 'Country, city, device, browser and language of visitors, from Google Analytics. Low engagement on a large row usually means automated visits.'],
  ['Core Web Vitals', 'Google’s three measures of page speed and steadiness: LCP, INP and CLS. A page passes when all three are Good for at least 3 in 4 real visits. Google uses them in search ranking. See the Speed page.'],
  ['LCP (Largest Contentful Paint)', 'How long until the biggest thing on the page is on screen. Good is 2.5 seconds or less.'],
  ['INP (Interaction to Next Paint)', 'How quickly the page reacts to a click, tap or key press. Good is 200 milliseconds or less. A test run cannot measure it, so the test run shows Total Blocking Time instead.'],
  ['CLS (Cumulative Layout Shift)', 'How much the page jumps around while loading. Good is 0.1 or less; lower is better.'],
  ['Real visitors vs test run', 'Real visitors: what Chrome users actually experienced over the last 28 days, from Google. It changes slowly. Test run: one fresh Lighthouse test, which shows what to fix but moves from run to run.'],
  ['Performance score', 'Lighthouse’s overall speed score out of 100 from one test run: 90 and above is good, 50 to 89 needs work, below 50 is poor.'],
  ['Per day vs before', 'Sessions per day in the chosen range compared with sessions per day in the equal range just before it.'],
];

export default function HelpPage() {
  return (
    <div className="prose">
      <h1>How to read this dashboard</h1>
      <p className="muted">What each number means, where it comes from and what to be careful about.</p>

      <h2>The headline</h2>
      <p>The sentence at the top of the Overview answers one question: is the product improving? It compares the chosen range with the range just before it, and names at most two things that got better and two that got worse. A metric has to move by at least 5% (better) or 4% (worse) to be mentioned, and rates with very few sessions behind them are ignored.</p>

      <h2>The numbers</h2>
      <dl>{METRICS.map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</dl>

      <h2>Comparing with the previous period</h2>
      <p>Every change is measured against the comparison period you choose in the date picker at the top right. By default that is the period of the same length just before: with a 14 day range, the 14 days before it. You can instead compare with the same dates last year or with any dates you pick, or turn Compare off. Today is never included because it is not finished. Tiles use per-day averages and rates, so a missing day does not look like a drop. The arrow and the words next to a change say whether it is better or worse, not only the colour.</p>

      <h2>Alerts</h2>
      <p>“Needs attention” lists metrics that moved by at least the chosen percentage. Nothing is flagged until both periods have at least 3 days of data and there are at least 200 human sessions. Rates built on fewer than 10 sessions are never flagged, because a change from 1 session to 2 is not a trend.</p>

      <h2>Where the data comes from</h2>
      <p><strong>Microsoft Clarity</strong> shows how people behave on the site: scrolling, clicks and friction, human visitors only. The app asks Clarity for the previous day at 00:05 UTC (06:05 in Bangladesh) and stores it, because Clarity only keeps the last 1 to 3 days. Its charts therefore start from the first stored day.</p>
      <p><strong>Google Analytics (GA4)</strong> shows where visits come from and where they start: sessions, active users, engagement rate, key events and landing pages. GA4 can return history, so its first sync reads the last 90 days, and each night the last 3 days are read again because GA4 revises recent days. Every GA4 number is labelled “GA4”.</p>
      <p>The two sources count differently. GA4 only removes bots it recognises, so its sessions are higher than Clarity’s human sessions. Do not add them together or expect them to match; use each for what it is good at.</p>

      <h2>Things to be careful about</h2>
      <ul>
        <li><strong>Approximate days.</strong> If the server was off at 00:05 UTC, the app fills the missed Clarity day from a 24 hour window taken after the restart. The latest two GA4 days can still change. Both are labelled approximate.</li>
        <li><strong>Gaps.</strong> A day with no data is a gap in the chart, not a zero.</li>
        <li><strong>Pages.</strong> A visit that looks at three pages counts once on each of them. Clarity cannot say which page a visit started on; the landing pages table on the Pages screen comes from GA4.</li>
        <li><strong>Test traffic.</strong> Visits from local or test addresses are left out of the page tables but cannot be separated from the overall totals.</li>
        <li><strong>Limits.</strong> Clarity returns at most 1,000 rows per request, so rare pages can be missing, and it allows 10 requests per rolling 24 hours.</li>
      </ul>
    </div>
  );
}
