import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class MetricSnapshot {
  @Prop({ required: true }) provider: string; // 'clarity' (later 'ga4')
  @Prop({ required: true }) date: string; // UTC day, YYYY-MM-DD
  @Prop({ required: true }) window: string; // day | rolling24h | baseline72h
  @Prop({ required: true }) breakdown: string; // none | url | channel | ...
  @Prop({ required: true }) numOfDays: number;
  @Prop({ required: true }) fetchedAt: Date;
  // true for a catch-up day: a rolling 24 hours ending at restart time, not a clean UTC day
  @Prop({ default: false }) approximate: boolean;
  // The raw API response, kept as returned so it can be re-read when the shape is better understood.
  @Prop({ type: [Object], default: [] }) payload: unknown[];
}
export type MetricSnapshotDocument = HydratedDocument<MetricSnapshot>;
export const MetricSnapshotSchema = SchemaFactory.createForClass(MetricSnapshot);
MetricSnapshotSchema.index({ provider: 1, date: 1, window: 1, breakdown: 1 }, { unique: true });

@Schema({ _id: false })
export class SyncResult {
  @Prop({ required: true }) breakdown: string;
  @Prop({ required: true }) outcome: string; // ok | error | skipped_budget | skipped_exists
  @Prop() error?: string;
  @Prop() rows?: number;
}

@Schema({ timestamps: true })
export class SyncRun {
  @Prop({ required: true }) provider: string;
  @Prop({ required: true }) trigger: string; // cron | manual | probe
  @Prop({ required: true }) startedAt: Date;
  @Prop() finishedAt?: Date;
  @Prop({ required: true }) status: string; // running | success | partial | failed
  @Prop({ default: 0 }) callsUsed: number;
  @Prop({ default: false }) rateLimited: boolean;
  @Prop({ type: [SchemaFactory.createForClass(SyncResult)], default: [] }) results: SyncResult[];
  @Prop() error?: string;
}
export type SyncRunDocument = HydratedDocument<SyncRun>;
export const SyncRunSchema = SchemaFactory.createForClass(SyncRun);
SyncRunSchema.index({ provider: 1, startedAt: -1 });

/** A small named setting an admin can change, for example the time of the daily speed check. */
@Schema({ timestamps: true })
export class AppSetting {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ required: true }) value: string;
}
export type AppSettingDocument = HydratedDocument<AppSetting>;
export const AppSettingSchema = SchemaFactory.createForClass(AppSetting);

// ---- page speed (PageSpeed Insights) ----

/** A page checked every day. Removing one switches it off but keeps its history. */
@Schema({ timestamps: true })
export class SpeedTarget {
  @Prop({ required: true, unique: true }) url: string;
  @Prop() label?: string;
  @Prop({ default: true }) active: boolean;
  @Prop() createdBy?: string;
}
export type SpeedTargetDocument = HydratedDocument<SpeedTarget>;
export const SpeedTargetSchema = SchemaFactory.createForClass(SpeedTarget);

/** One finished (or failed) test of one page on one device. Small on purpose: no Lighthouse report is kept. */
@Schema({ timestamps: true })
export class SpeedResult {
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) strategy: string; // mobile | desktop
  @Prop({ required: true }) day: string; // Bangladesh calendar day, YYYY-MM-DD
  @Prop({ required: true }) runAt: Date;
  @Prop({ required: true }) trigger: string; // scheduled | manual | added
  @Prop({ required: true }) ok: boolean;
  @Prop() error?: string;
  @Prop({ type: Number }) perfScore?: number | null;
  @Prop({ type: Object }) lab?: Record<string, number | null>;
  @Prop({ type: Object }) field?: Record<string, unknown>;
  @Prop() verdict?: string; // pass | fail | none  (Core Web Vitals assessment from real-user data)
  @Prop() finalUrl?: string;
  @Prop() lighthouseVersion?: string;
}
export type SpeedResultDocument = HydratedDocument<SpeedResult>;
export const SpeedResultSchema = SchemaFactory.createForClass(SpeedResult);
SpeedResultSchema.index({ url: 1, strategy: 1, runAt: -1 });
SpeedResultSchema.index({ day: 1, trigger: 1 });

/** The recommendations from the most recent test only; older ones are not kept. */
@Schema({ timestamps: true })
export class SpeedAudits {
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) strategy: string;
  @Prop({ required: true }) runAt: Date;
  @Prop({ type: [Object], default: [] }) audits: unknown[];
}
export type SpeedAuditsDocument = HydratedDocument<SpeedAudits>;
export const SpeedAuditsSchema = SchemaFactory.createForClass(SpeedAudits);
SpeedAuditsSchema.index({ url: 1, strategy: 1 }, { unique: true });

/** A manual test in progress. Kept in the database so a restart cannot leave it half-forgotten. */
@Schema({ timestamps: true })
export class SpeedJob {
  @Prop({ required: true }) url: string;
  @Prop({ type: [String], default: [] }) strategies: string[];
  @Prop({ required: true }) status: string; // queued | running | done | failed
  @Prop() requestedBy?: string;
  @Prop({ type: [Object], default: [] }) results: { strategy: string; ok: boolean; error?: string }[];
  @Prop() error?: string;
}
export type SpeedJobDocument = HydratedDocument<SpeedJob>;
export const SpeedJobSchema = SchemaFactory.createForClass(SpeedJob);
SpeedJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
