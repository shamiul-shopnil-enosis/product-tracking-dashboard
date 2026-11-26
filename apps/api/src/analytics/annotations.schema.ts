import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { profileScope } from '../profiles/scope.plugin';

export const ANNOTATION_KINDS = ['release', 'campaign', 'incident', 'other'] as const;

@Schema({ timestamps: true })
export class Annotation {
  @Prop({ required: true }) date: string; // UTC day, YYYY-MM-DD
  @Prop({ required: true, trim: true }) label: string;
  @Prop({ required: true, enum: ANNOTATION_KINDS }) kind: string;
  @Prop({ required: true }) createdById: string;
  @Prop({ required: true }) createdByName: string;
}
export type AnnotationDocument = HydratedDocument<Annotation>;
export const AnnotationSchema = SchemaFactory.createForClass(Annotation);
AnnotationSchema.plugin(profileScope);
AnnotationSchema.index({ profileId: 1, date: 1 });
