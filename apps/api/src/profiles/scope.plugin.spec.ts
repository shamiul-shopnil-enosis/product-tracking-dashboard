import { Schema } from 'mongoose';
import { NoProfileError, runWithProfile } from './profile-context';
import { profileScope } from './scope.plugin';

type Hook = (this: unknown, ...a: unknown[]) => unknown;

function collect() {
  const hooks: Array<{ ops: unknown; fn: Hook }> = [];
  const schema = new Schema({ name: String });
  const real = schema.pre.bind(schema);
  (schema as unknown as { pre: unknown }).pre = (ops: unknown, ...rest: unknown[]) => {
    const fn = rest[rest.length - 1] as Hook;
    hooks.push({ ops, fn });
    return (real as unknown as (...a: unknown[]) => unknown)(ops, ...rest);
  };
  schema.plugin(profileScope);
  return { schema, hooks };
}

describe('profileScope', () => {
  it('adds a required profileId and an index', () => {
    const { schema } = collect();
    expect(schema.path('profileId')).toBeDefined();
  });

  it('limits queries to the active profile and throws without one', () => {
    const { hooks } = collect();
    const q = hooks.find((h) => Array.isArray(h.ops) && (h.ops as string[]).includes('findOne'))!;
    const calls: unknown[] = [];
    const query = { getFilter: () => ({}), where: (c: unknown) => calls.push(c) };
    runWithProfile('A', () => q.fn.call(query));
    expect(calls).toEqual([{ profileId: 'A' }]);
    expect(() => q.fn.call(query)).toThrow(NoProfileError);
  });

  it('respects an explicit profileId in the filter (migration and per-profile loops)', () => {
    const { hooks } = collect();
    const q = hooks.find((h) => Array.isArray(h.ops) && (h.ops as string[]).includes('updateMany'))!;
    const calls: unknown[] = [];
    q.fn.call({ getFilter: () => ({ profileId: 'B' }), where: (c: unknown) => calls.push(c) });
    expect(calls).toEqual([]);
  });

  it('stamps new documents with the active profile', () => {
    const { hooks } = collect();
    const v = hooks.find((h) => h.ops === 'validate')!;
    const doc: Record<string, unknown> = {};
    const self = { get: (k: string) => doc[k], set: (k: string, val: unknown) => { doc[k] = val; } };
    runWithProfile('A', () => v.fn.call(self));
    expect(doc.profileId).toBe('A');
    expect(() => v.fn.call({ get: () => undefined, set: () => undefined })).toThrow(NoProfileError);
  });

  it('puts a profile filter in front of every aggregation', () => {
    const { hooks } = collect();
    const a = hooks.find((h) => h.ops === 'aggregate')!;
    const pipeline: unknown[] = [{ $group: {} }];
    runWithProfile('A', () => a.fn.call({ pipeline: () => pipeline }));
    expect(pipeline[0]).toEqual({ $match: { profileId: 'A' } });
  });
});
