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
