import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { profileScope } from '../profiles/scope.plugin';

/** Which cards a person chose to show on their Overview, in order. No document means they use the default view. */
@Schema({ timestamps: true })
export class DashboardLayout {
  @Prop({ required: true }) userId: string;
  @Prop({ type: [String], default: [] }) cards: string[];
}
export type DashboardLayoutDocument = HydratedDocument<DashboardLayout>;
export const DashboardLayoutSchema = SchemaFactory.createForClass(DashboardLayout);
DashboardLayoutSchema.plugin(profileScope);
DashboardLayoutSchema.index({ profileId: 1, userId: 1 }, { unique: true });
