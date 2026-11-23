import { periodsFor, spanDays } from './aggregate';
import { spanOf } from './dashboard.controller';

const NOW = new Date('2026-11-23T10:00:00Z'); // yesterday = 2026-11-22

describe('periodsFor with a custom range', () => {
  it('compares with the equal period just before when no comparison is given', () => {
    const r = periodsFor({ from: '2026-11-10', to: '2026-11-16' });
    expect(r).toMatchObject({ days: 7, from: '2026-11-10', to: '2026-11-16', previousFrom: '2026-11-03', previousTo: '2026-11-09' });
  });
  it('uses a custom comparison period', () => {
    const r = periodsFor({ from: '2026-11-10', to: '2026-11-16', compareFrom: '2026-01-01', compareTo: '2026-01-31' });
    expect(r).toMatchObject({ previousFrom: '2026-01-01', previousTo: '2026-01-31' });
  });
  it('keeps the last-N-days behaviour', () => {
    expect(periodsFor(14, NOW)).toMatchObject({ days: 14, from: '2026-11-09', to: '2026-11-22', previousFrom: '2026-10-26', previousTo: '2026-11-08' });
  });
  it('counts the days of a span', () => {
    expect(spanDays(30)).toBe(30);
    expect(spanDays({ from: '2026-11-10', to: '2026-11-10' })).toBe(1);
  });
});

describe('spanOf', () => {
  it('defaults to 14 days', () => expect(spanOf({}, NOW)).toBe(14));
  it('passes days through', () => expect(spanOf({ days: 30 }, NOW)).toBe(30));
  it('accepts a finished range', () => expect(spanOf({ from: '2026-11-01', to: '2026-11-22' }, NOW)).toEqual({ from: '2026-11-01', to: '2026-11-22', compareFrom: undefined, compareTo: undefined }));
  it.each([
    [{ from: '2026-11-01' }, 'both a start and an end'],
    [{ from: '2026-11-05', to: '2026-11-01' }, 'after the end'],
    [{ from: '2026-11-01', to: '2026-11-23' }, 'Today is not finished'],
    [{ from: '2026-02-30', to: '2026-03-02' }, 'not a real date'],
    [{ from: '2025-01-01', to: '2026-11-22' }, 'at most'],
    [{ from: '2026-11-01', to: '2026-11-10', compareFrom: '2026-10-01' }, 'both a start and an end for the comparison'],
    [{ compareFrom: '2026-10-01', compareTo: '2026-10-10' }, 'needs a date range'],
  ])('rejects %j', (q, message) => {
    expect(() => spanOf(q, NOW)).toThrow(message);
  });
});
