import { pageUrlProblem, stateProblems } from './findings.rules';

const ok = { status: 'new', plannedRelease: '', ignoredReason: '', githubUrl: '' };

describe('stateProblems', () => {
  it('accepts a plain new finding', () => {
    expect(stateProblems(ok)).toEqual([]);
  });
  it('requires a reason when ignored', () => {
    expect(stateProblems({ ...ok, status: 'ignored' })).toHaveLength(1);
    expect(stateProblems({ ...ok, status: 'ignored', ignoredReason: 'duplicate' })).toEqual([]);
  });
  it('requires a release when planned', () => {
    expect(stateProblems({ ...ok, status: 'planned' })).toHaveLength(1);
    expect(stateProblems({ ...ok, status: 'planned', plannedRelease: '4.1.0' })).toEqual([]);
  });
  it('accepts only github.com links', () => {
    expect(stateProblems({ ...ok, githubUrl: 'https://github.com/org/repo/issues/1' })).toEqual([]);
    expect(stateProblems({ ...ok, githubUrl: 'https://evil.com/github.com' })).toHaveLength(1);
    expect(stateProblems({ ...ok, githubUrl: 'javascript:alert(1)' })).toHaveLength(1);
  });
});

describe('pageUrlProblem', () => {
  it('accepts empty and full web addresses', () => {
    expect(pageUrlProblem('')).toBeNull();
    expect(pageUrlProblem('https://example.com/a?x=1')).toBeNull();
  });
  it('rejects paths, scripts and junk', () => {
    expect(pageUrlProblem('/auth/sign-in')).not.toBeNull();
    expect(pageUrlProblem('javascript:alert(1)')).not.toBeNull();
    expect(pageUrlProblem('nope')).not.toBeNull();
  });
});
