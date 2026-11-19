import { hasMinRole, Role } from './roles';

describe('hasMinRole', () => {
  it('ranks admin > editor > viewer', () => {
    expect(hasMinRole(Role.Admin, Role.Editor)).toBe(true);
    expect(hasMinRole(Role.Editor, Role.Editor)).toBe(true);
    expect(hasMinRole(Role.Viewer, Role.Editor)).toBe(false);
    expect(hasMinRole(Role.Editor, Role.Admin)).toBe(false);
  });

  it('rejects an unknown role', () => {
    expect(hasMinRole('hacker' as Role, Role.Viewer)).toBe(false);
  });
});
