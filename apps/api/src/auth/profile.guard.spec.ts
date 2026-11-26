import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../common/roles';
import { ProfilesService } from '../profiles/profiles.service';
import { profileStore } from '../profiles/profile-context';
import { ProfileGuard } from './profile.guard';

const docs = [
  { id: 'A', name: 'Enosis Outsourcing', isDefault: true, archived: false },
  { id: 'B', name: 'Geeky Ends', isDefault: false, archived: false },
  { id: 'C', name: 'Old', isDefault: false, archived: true },
];
const profiles = new ProfilesService({} as never, {} as never, {} as never);
(profiles as unknown as { cache: unknown[] }).cache = docs;

function run(user: unknown, header?: string, meta: Record<string, boolean> = {}) {
  const reflector = { getAllAndOverride: (k: string) => meta[k] } as unknown as Reflector;
  const guard = new ProfileGuard(reflector, profiles);
  const req = { user, headers: header ? { 'x-profile': header } : {} } as { user: { role: Role; profileId?: string }; headers: Record<string, string> };
  const store: { profileId?: string } = {};
  const ctx = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => req }) } as never;
  const result = profileStore.run(store, () => guard.canActivate(ctx));
  return { result, req, store };
}
const member = (profileId: string, role: Role) => ({ role: Role.Viewer, superAdmin: false, memberships: [{ profileId, role }] });

describe('ProfileGuard', () => {
  it('lets a member open their profile with the role they hold there', () => {
    const { req, store } = run(member('B', Role.Editor), 'B');
    expect(req.user.role).toBe(Role.Editor);
    expect(req.user.profileId).toBe('B');
    expect(store.profileId).toBe('B');
  });

  it('refuses a profile the person has no access to, whatever the header says', () => {
    expect(() => run(member('B', Role.Admin), 'A')).toThrow(ForbiddenException);
  });

  it('refuses an archived profile, even for a super admin', () => {
    expect(() => run({ role: Role.Admin, superAdmin: true, memberships: [] }, 'C')).toThrow(ForbiddenException);
  });

  it('lets a super admin open any profile as admin', () => {
    const { req } = run({ role: Role.Viewer, superAdmin: true, memberships: [] }, 'B');
    expect(req.user.role).toBe(Role.Admin);
  });

  it('without a header picks the default profile, or the first one they can open', () => {
    expect(run({ role: Role.Admin, superAdmin: true, memberships: [] }).req.user.profileId).toBe('A');
    expect(run(member('B', Role.Viewer)).req.user.profileId).toBe('B');
  });

  it('refuses a person with no profile at all', () => {
    expect(() => run({ role: Role.Admin, superAdmin: false, memberships: [] })).toThrow(ForbiddenException);
  });

  it('skips public routes and routes marked as not about a profile', () => {
    expect(run(undefined, undefined, { isPublic: true }).store.profileId).toBeUndefined();
    expect(run(member('B', Role.Viewer), undefined, { noProfile: true }).store.profileId).toBeUndefined();
  });
});
