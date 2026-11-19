export enum Role {
  Viewer = 'viewer',
  Editor = 'editor',
  Admin = 'admin',
}

const RANK: Record<Role, number> = {
  [Role.Viewer]: 1,
  [Role.Editor]: 2,
  [Role.Admin]: 3,
};

/** True when `actual` is at least as privileged as `minimum`. */
export function hasMinRole(actual: Role, minimum: Role): boolean {
  return (RANK[actual] ?? 0) >= RANK[minimum];
}
