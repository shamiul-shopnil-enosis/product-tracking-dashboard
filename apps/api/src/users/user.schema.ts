import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../common/roles';

export type LinkPurpose = 'invite' | 'reset';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  /** Absent until an invited person sets their own password. */
  @Prop({ type: String })
  passwordHash?: string;

  @Prop({ type: String, enum: Object.values(Role), default: Role.Viewer })
  role: Role;

  @Prop({ default: true })
  active: boolean;

  /** Raised to end every existing session for this user (sign-out, password change, deactivation). */
  @Prop({ type: Number, default: 0 })
  tokenVersion: number;

  /** SHA-256 of the one-time invite or reset link token. The token itself is never stored. */
  @Prop({ type: String, index: true, sparse: true })
  linkTokenHash?: string;

  @Prop({ type: String, enum: ['invite', 'reset'] })
  linkPurpose?: LinkPurpose;

  @Prop({ type: Date })
  linkExpiresAt?: Date;

  @Prop({ type: Date })
  lastLoginAt?: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
