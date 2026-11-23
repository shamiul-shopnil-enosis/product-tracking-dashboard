import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { isValidObjectId, Model } from 'mongoose';
import { Role } from '../common/roles';
import { CreateUserInput, InviteUserDto, MIN_PASSWORD_LENGTH, UpdateUserDto } from './users.dto';
import { LinkPurpose, User, UserDocument } from './user.schema';

export const LINK_TTL_MS = 72 * 60 * 60 * 1000;
export const BAD_LINK = 'This link is invalid or has expired. Ask an admin for a new one.';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export type UserStatus = 'active' | 'invited' | 'deactivated';

/** What the admin list shows: the public fields plus status, last sign-in and any pending link. */
export interface AdminUser extends PublicUser {
  status: UserStatus;
  lastLoginAt: string | null;
  link: { purpose: LinkPurpose; expiresAt: string; expired: boolean } | null;
}

export function toPublic(u: UserDocument): PublicUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: u.active };
}

export function toAdmin(u: UserDocument, now = new Date()): AdminUser {
  const status: UserStatus = !u.active ? 'deactivated' : u.passwordHash ? 'active' : 'invited';
  const link =
    u.linkTokenHash && u.linkPurpose && u.linkExpiresAt
      ? { purpose: u.linkPurpose, expiresAt: u.linkExpiresAt.toISOString(), expired: u.linkExpiresAt.getTime() <= now.getTime() }
      : null;
  return { ...toPublic(u), status, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, link };
}

export const hashLinkToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly model: Model<UserDocument>,
    private readonly config: ConfigService,
  ) {}

  /** Backfill the session counter on older users, then create the first admin when no users exist. */
  async onModuleInit() {
    await this.model.updateMany({ tokenVersion: { $exists: false } }, { $set: { tokenVersion: 0 } });
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;
    if ((await this.model.estimatedDocumentCount()) > 0) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      this.logger.error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters; admin not created`);
      return;
    }
    await this.create({
      name: this.config.get<string>('ADMIN_NAME', 'Admin'),
      email,
      password,
      role: Role.Admin,
    });
    this.logger.log(`Created first admin ${email.toLowerCase()}`);
  }

  hash(password: string) {
    return bcrypt.hash(password, 12);
  }

  findByEmail(email: string) {
    return this.model.findOne({ email: email.toLowerCase().trim() });
  }

  async findById(id: string) {
    if (!isValidObjectId(id)) return null;
    return this.model.findById(id);
  }

  async list() {
    const users = await this.model.find().sort({ createdAt: 1 });
    const now = new Date();
    return users.map((u) => toAdmin(u, now));
  }

  private async insert(fields: { name: string; email: string; role: Role; passwordHash?: string }) {
    try {
      return await this.model.create({ ...fields, name: fields.name.trim() });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('A user with this email already exists');
      }
      throw err;
    }
  }

  /** Used for the first admin, who has a password from the environment. */
  async create(input: CreateUserInput) {
    const user = await this.insert({
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await this.hash(input.password),
    });
    return toPublic(user);
  }

  /** Add a person with no password; the returned token goes into their one-time invite link. */
  async invite(dto: InviteUserDto) {
    const user = await this.insert({ name: dto.name, email: dto.email, role: dto.role });
    return this.issueLink(user.id);
  }

  /**
   * Make a fresh one-time link: an invite when the person has no password yet, otherwise a password
   * reset. It replaces any earlier link. Only a hash is stored, so the token is shown once.
   */
  async issueLink(id: string): Promise<{ user: AdminUser; token: string; purpose: LinkPurpose }> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (!user.active) throw new BadRequestException('Activate this user before sending a link');
    const token = randomBytes(32).toString('base64url');
    const purpose: LinkPurpose = user.passwordHash ? 'reset' : 'invite';
    user.linkTokenHash = hashLinkToken(token);
    user.linkPurpose = purpose;
    user.linkExpiresAt = new Date(Date.now() + LINK_TTL_MS);
    await user.save();
    return { user: toAdmin(user), token, purpose };
  }

  /** Who a link is for, so the page can greet them. Never reveals anything without a valid token. */
  async describeLink(token: string) {
    const user = await this.model.findOne({
      linkTokenHash: hashLinkToken(token),
      linkExpiresAt: { $gt: new Date() },
      active: true,
    });
    if (!user || !user.linkPurpose) throw new BadRequestException(BAD_LINK);
    return { name: user.name, email: user.email, purpose: user.linkPurpose };
  }

  /** Use a link once, atomically: set the password, clear the link and end every older session. */
  async redeemLink(token: string, password: string) {
    const tokenHash = hashLinkToken(token);
    const live = { linkTokenHash: tokenHash, linkExpiresAt: { $gt: new Date() }, active: true };
    if (!(await this.model.exists(live))) throw new BadRequestException(BAD_LINK);
    const passwordHash = await this.hash(password);
    const user = await this.model.findOneAndUpdate(
      live,
      {
        $set: { passwordHash, lastLoginAt: new Date() },
        $unset: { linkTokenHash: 1, linkPurpose: 1, linkExpiresAt: 1 },
        $inc: { tokenVersion: 1 },
      },
      { new: true },
    );
    if (!user) throw new BadRequestException(BAD_LINK);
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (dto.name !== undefined) user.name = dto.name.trim();
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.active !== undefined) {
      if (user.active && !dto.active) {
        // Deactivating ends every session and cancels any pending link, so reactivating cannot revive them.
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
        user.linkTokenHash = undefined;
        user.linkPurpose = undefined;
        user.linkExpiresAt = undefined;
      }
      user.active = dto.active;
    }
    await user.save();
    return toAdmin(user);
  }

  /** Change a password and end every other session; returns the user with the new session counter. */
  async changePassword(id: string, passwordHash: string) {
    const user = await this.model.findByIdAndUpdate(id, { $set: { passwordHash }, $inc: { tokenVersion: 1 } }, { new: true });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async markLogin(id: string) {
    await this.model.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } });
  }

  /** End the session only if it is still the current one, so an old cookie cannot sign out a newer one. */
  async revokeSessions(id: string, version: number) {
    if (!isValidObjectId(id)) return;
    await this.model.updateOne({ _id: id, tokenVersion: version }, { $inc: { tokenVersion: 1 } });
  }
}
