import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Which cards a person chose to show on their Overview, in order. No document means they use the default view. */
@Schema({ timestamps: true })
export class DashboardLayout {
  @Prop({ required: true, unique: true }) userId: string;
  @Prop({ type: [String], default: [] }) cards: string[];
}
export type DashboardLayoutDocument = HydratedDocument<DashboardLayout>;
export const DashboardLayoutSchema = SchemaFactory.createForClass(DashboardLayout);
