import { computePriority } from './priority';

describe('computePriority', () => {
  it('puts severity 4 with some or most reach in next_release', () => {
    expect(computePriority(4, 'some', 'L').band).toBe('next_release');
    expect(computePriority(4, 'most', 'M').band).toBe('next_release');
  });

  it('puts severity 4 with few reach in planned', () => {
    expect(computePriority(4, 'few', 'S').band).toBe('planned');
  });

  it('puts severity 3 with most reach in next_planned_release', () => {
    expect(computePriority(3, 'most', 'L').band).toBe('next_planned_release');
    expect(computePriority(3, 'some', 'S').band).toBe('planned');
  });

  it('computes severity x reach x effort factor', () => {
    expect(computePriority(4, 'most', 'S').score).toBe(14.4);
    expect(computePriority(3, 'some', 'M').score).toBe(6);
    expect(computePriority(2, 'few', 'L').score).toBe(1.6);
  });

  it('prefers smaller effort for the same severity and reach', () => {
    expect(computePriority(2, 'some', 'S').score).toBeGreaterThan(computePriority(2, 'some', 'L').score);
  });
});
