import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';

/** The profile a piece of work belongs to. Filled in by the profile guard (requests) or by `runWithProfile` (background jobs). */
export interface ProfileStore { profileId?: string }
export const profileStore = new AsyncLocalStorage<ProfileStore>();

export class NoProfileError extends Error {
  constructor() {
    super('This work ran without a profile. Scoped data must be read inside a request or runWithProfile().');
  }
}

export const currentProfileId = (): string | undefined => profileStore.getStore()?.profileId;

/** The active profile, or an error: scoped data is never read "for everyone". */
export function requireProfileId(): string {
  const id = currentProfileId();
  if (!id) throw new NoProfileError();
  return id;
}

/** Run background work (a nightly sync, a startup check) as one profile. */
export function runWithProfile<T>(profileId: string, fn: () => T): T {
  return profileStore.run({ profileId }, fn);
}

/** Gives every request its own store; the guard fills in the profile once it knows who is asking and what they may open. */
export function profileMiddleware(_req: Request, _res: Response, next: NextFunction) {
  profileStore.run({}, next);
}
