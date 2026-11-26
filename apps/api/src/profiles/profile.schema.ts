import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** One site or product with its own connections and its own data. People are given access to profiles. */
@Schema({ timestamps: true })
export class Profile {
  @Prop({ required: true, trim: true, maxlength: 80 }) name: string;
  /** The first profile. It keeps using the server's .env values until they are saved from the screen. */
  @Prop({ default: false }) isDefault: boolean;
  @Prop({ default: false }) archived: boolean;
  /** Connection settings by key (see MANAGED_KEYS). Secret values are stored encrypted. */
  @Prop({ type: Object, default: {} }) settings: Record<string, string>;
}
export type ProfileDocument = HydratedDocument<Profile>;
export const ProfileSchema = SchemaFactory.createForClass(Profile);
