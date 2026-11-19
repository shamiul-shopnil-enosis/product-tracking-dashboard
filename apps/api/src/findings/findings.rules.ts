export interface StateFields {
  status: string;
  plannedRelease: string;
  ignoredReason: string;
  githubUrl: string;
}

/** Cross-field rules. Returns a list of problems (empty when valid). */
export function stateProblems(f: StateFields): string[] {
  const problems: string[] = [];
  if (f.status === 'ignored' && !f.ignoredReason.trim()) problems.push('An ignored finding needs a reason');
  if (f.status === 'planned' && !f.plannedRelease.trim()) problems.push('A planned finding needs a release');
  if (f.githubUrl) {
    let host = '';
    try {
      const u = new URL(f.githubUrl);
      host = u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.toLowerCase() : '';
    } catch {
      /* invalid */
    }
    if (host !== 'github.com' && !host.endsWith('.github.com')) {
      problems.push('GitHub link must be a github.com URL');
    }
  }
  return problems;
}

/** A linked page must be a full web address (or empty). */
export function pageUrlProblem(url: string): string | null {
  if (!url.trim()) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? null : 'Page must be a full web address (https://…)';
  } catch {
    return 'Page must be a full web address (https://…)';
  }
}
