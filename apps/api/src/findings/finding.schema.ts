import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BANDS, EFFORTS, FINDING_TYPES, REACHES, STATUSES } from './findings.constants';

@Schema({ _id: false })
export class EvidenceLink {
  @Prop({ trim: true, default: '' }) label: string;
  @Prop({ required: true, trim: true }) url: string;
}

@Schema()
export class Attachment {
  @Prop({ required: true }) storedName: string;
  @Prop({ required: true }) filename: string;
  @Prop({ required: true }) mime: string;
  @Prop({ required: true }) size: number;
  @Prop({ required: true }) uploadedBy: string;
  @Prop({ default: () => new Date() }) uploadedAt: Date;
}

@Schema({ _id: false })
export class ResultCheck {
  @Prop() date?: Date;
  @Prop({ trim: true, default: '' }) before: string;
  @Prop({ trim: true, default: '' }) after: string;
}

@Schema({ timestamps: true })
export class Finding {
  @Prop({ required: true, unique: true }) ref: number;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, enum: FINDING_TYPES }) type: string;
  @Prop({ required: true, trim: true }) where: string;
  @Prop({ trim: true, default: '' }) description: string;
  @Prop({ trim: true, default: '' }) whyItMatters: string;
  @Prop({ required: true, min: 1, max: 4 }) severity: number;
  @Prop({ required: true, enum: REACHES }) reach: string;
  @Prop({ required: true, enum: EFFORTS }) effort: string;
  @Prop({ trim: true, default: '' }) suggestedChange: string;
  @Prop({ trim: true, default: '' }) surface: string;
  @Prop({ trim: true, default: '' }) firstMetric: string;
  @Prop({ required: true, enum: STATUSES, default: 'new' }) status: string;
  @Prop({ trim: true, default: '' }) plannedRelease: string;
  @Prop({ trim: true, default: '' }) ignoredReason: string;
  @Prop({ trim: true, default: '' }) githubUrl: string;
  // The page this finding is about, stored without query string or trailing slash so it matches the page tables
  @Prop({ trim: true, default: '' }) pageUrl: string;
  @Prop() shippedAt?: Date;
  @Prop({ type: [SchemaFactory.createForClass(EvidenceLink)], default: [] }) evidenceLinks: EvidenceLink[];
  @Prop({ type: [SchemaFactory.createForClass(Attachment)], default: [] }) attachments: Attachment[];
  @Prop({ type: SchemaFactory.createForClass(ResultCheck) }) resultCheck?: ResultCheck;

  // Priority: computed from severity, reach, effort. Editors may override the score and/or band.
  @Prop({ required: true }) computedScore: number;
  @Prop({ required: true, enum: BANDS }) computedBand: string;
  @Prop({ type: Number, default: null }) overrideScore: number | null;
  @Prop({ type: String, enum: [...BANDS, null], default: null }) overrideBand: string | null;
  @Prop({ trim: true, default: '' }) overrideReason: string;
  // Denormalised so the list can sort in the database.
  @Prop({ required: true }) effectiveScore: number;
  @Prop({ required: true, enum: BANDS }) effectiveBand: string;
  @Prop({ required: true }) effectiveBandRank: number;

  @Prop({ required: true }) createdById: string;
  @Prop({ required: true }) createdByName: string;
}

export type FindingDocument = HydratedDocument<Finding>;
export const FindingSchema = SchemaFactory.createForClass(Finding);
FindingSchema.index({ effectiveBandRank: -1, effectiveScore: -1 });
FindingSchema.index({ status: 1, type: 1, severity: 1 });

@Schema({ collection: 'counters' })
export class Counter {
  @Prop({ required: true }) _id: string;
  @Prop({ default: 0 }) seq: number;
}
export type CounterDocument = HydratedDocument<Counter>;
export const CounterSchema = SchemaFactory.createForClass(Counter);
