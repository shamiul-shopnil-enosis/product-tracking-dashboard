import type { MongooseQueryMiddleware, Query, Schema } from 'mongoose';
import { requireProfileId } from './profile-context';

const QUERY_OPS = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
  'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany', 'countDocuments', 'distinct',
] as MongooseQueryMiddleware[];

/**
 * Makes a collection belong to a profile. Every read, update and delete is limited to the active profile,
 * and every new document is stamped with it. With no active profile the operation throws instead of
 * quietly touching everyone's data. An explicit `profileId` in a filter (migration, per-profile loops) is respected.
 * Not covered (do not use on scoped models): bulkWrite, estimatedDocumentCount, native `collection` calls.
 */
export function profileScope(schema: Schema) {
  schema.add({ profileId: { type: String, required: true } });
  schema.index({ profileId: 1 });

  schema.pre(QUERY_OPS, { document: false, query: true }, function (this: Query<unknown, unknown>) {
    const filter = this.getFilter() as Record<string, unknown>;
    if (filter.profileId === undefined) this.where({ profileId: requireProfileId() });
  });

  schema.pre('validate', function () {
    if (!this.get('profileId')) this.set('profileId', requireProfileId());
  });

  schema.pre('insertMany', function (next, docs: Array<Record<string, unknown>> | Record<string, unknown>) {
    const id = requireProfileId();
    for (const d of Array.isArray(docs) ? docs : [docs]) if (!d.profileId) d.profileId = id;
    next();
  });

  schema.pre('aggregate', function () {
    const pipeline = this.pipeline();
    const first = pipeline[0] as { $match?: Record<string, unknown> } | undefined;
    if (!(first && first.$match && 'profileId' in first.$match)) pipeline.unshift({ $match: { profileId: requireProfileId() } });
  });
}
