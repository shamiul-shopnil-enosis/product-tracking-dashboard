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

  /** Can create profiles, manage their keys and decide who gets access. Sees every profile as admin. */
  @Prop({ default: false })
  superAdmin: boolean;

  /** Which profiles this person may open, and their role in each. */
  @Prop({ type: [{ _id: false, profileId: { type: String, required: true }, role: { type: String, enum: Object.values(Role), required: true } }], default: [] })
  memberships: Array<{ profileId: string; role: Role }>;

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
