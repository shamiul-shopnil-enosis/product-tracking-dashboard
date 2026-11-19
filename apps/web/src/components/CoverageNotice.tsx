import type { Coverage } from '@/lib/dashboard';

export function CoverageNotice({ current, previous }: { current: Coverage; previous: Coverage }) {
  if (current.daysWithData === 0) {
    return (
      <div className="notice">
        <strong>No full days stored yet.</strong> Clarity only gives the last 1 to 3 days, so the app saves one clean day each night at 00:05 UTC
        (06:05 in Bangladesh). The charts start after the first run.
      </div>
    );
  }
  return (
    <p className="muted">
      Showing {current.daysWithData} of {current.requestedDays} days ({current.firstDay} to {current.lastDay}).
      {previous.daysWithData === 0 ? ' No earlier period to compare with yet.' : ` Compared with ${previous.daysWithData} of ${previous.requestedDays} days before.`}
      {current.approximateDays.length > 0 && ` Approximate days: ${current.approximateDays.join(', ')}. GA4 can still revise its latest two days, and a Clarity day filled in after a restart is a 24-hour window, not a clean day.`}
    </p>
  );
}
