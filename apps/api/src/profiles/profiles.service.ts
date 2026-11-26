import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, isValidObjectId, Model } from 'mongoose';
import { Role } from '../common/roles';
import { RuntimeConfig } from '../settings/runtime-config';
import { Profile, ProfileDocument } from './profile.schema';
import { runWithProfile } from './profile-context';

export const DEFAULT_PROFILE_NAME = 'Enosis Outsourcing';
/** Collections whose documents belong to a profile (see profileScope). */
export const SCOPED_COLLECTIONS = ['metricsnapshots', 'syncruns', 'annotations', 'findings', 'speedtargets', 'speedresults', 'speedaudits', 'speedjobs', 'dashboardlayouts', 'appsettings'] as const;
/** Mongoose model names for the same collections, used to rebuild indexes after the move. */
export const SCOPED_MODELS = ['MetricSnapshot', 'SyncRun', 'Annotation', 'Finding', 'SpeedTarget', 'SpeedResult', 'SpeedAudits', 'SpeedJob', 'DashboardLayout', 'AppSetting'] as const;

export interface ProfileSummary { id: string; name: string; isDefault: boolean; role: Role }
export interface AccessUser { superAdmin?: boolean; role?: Role; memberships?: Array<{ profileId: string; role: Role }> }

@Injectable()
export class ProfilesService implements OnModuleInit {
  private readonly logger = new Logger(ProfilesService.name);
  private cache: ProfileDocument[] = [];

  constructor(
    @InjectModel(Profile.name) private readonly model: Model<ProfileDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly cfg: RuntimeConfig,
  ) {}

  async onModuleInit() {
    await this.migrate();
    await this.refresh();
  }

  /** Reload the profile list and each profile's saved settings into memory. */
  async refresh() {
    this.cache = await this.model.find().sort({ createdAt: 1 });
    for (const p of this.cache) this.cfg.load({ id: p.id, isDefault: p.isDefault, settings: p.settings });
  }

  all(): ProfileDocument[] { return this.cache.filter((p) => !p.archived); }
  defaultProfile(): ProfileDocument | undefined { return this.cache.find((p) => p.isDefault) ?? this.all()[0]; }
  byId(id: string): ProfileDocument | undefined { return this.cache.find((p) => p.id === id); }

  /** The profiles a person may open, with the role they have in each. Super admins may open all, as admin. */
  accessibleTo(user: AccessUser): ProfileSummary[] {
    const out: ProfileSummary[] = [];
    for (const p of this.all()) {
      if (user.superAdmin) { out.push({ id: p.id, name: p.name, isDefault: p.isDefault, role: Role.Admin }); continue; }
      const m = user.memberships?.find((x) => x.profileId === p.id);
      if (m) out.push({ id: p.id, name: p.name, isDefault: p.isDefault, role: m.role });
    }
    return out;
  }

  /** Run background work once for every profile, each inside its own profile. One profile failing never stops the others. */
  async each(fn: (p: ProfileDocument) => Promise<void> | void): Promise<void> {
    for (const p of this.all()) {
      try { await runWithProfile(p.id, () => fn(p)); }
      catch (err) { this.logger.error(`Background job failed for profile "${p.name}": ${(err as Error).message}`); }
    }
  }

  /** Run something as the default profile (public endpoints such as the sign-in page's "last updated"). */
  runAsDefault<T>(fn: () => T): T | undefined {
    const p = this.defaultProfile();
    return p ? runWithProfile(p.id, fn) : undefined;
  }

  async create(name: string): Promise<ProfileDocument> {
    const n = (name ?? '').trim();
    if (!n || n.length > 80) throw new BadRequestException('Give the profile a name of 1 to 80 characters');
    if (this.cache.some((p) => !p.archived && p.name.toLowerCase() === n.toLowerCase())) throw new ConflictException('A profile with this name already exists');
    const p = await this.model.create({ name: n, settings: { SITE_NAME: n } });
    await this.refresh();
    this.logger.log(`Created profile "${n}"`);
    return p;
  }

  async rename(id: string, name: string): Promise<ProfileDocument> {
    const n = (name ?? '').trim();
    if (!n || n.length > 80) throw new BadRequestException('Give the profile a name of 1 to 80 characters');
    const p = await this.load(id);
    if (this.cache.some((x) => x.id !== id && !x.archived && x.name.toLowerCase() === n.toLowerCase())) throw new ConflictException('A profile with this name already exists');
    await this.model.updateOne({ _id: p._id }, { $set: { name: n, 'settings.SITE_NAME': n } });
    await this.refresh();
    return (await this.load(id));
  }

  /** Hides a profile and stops its syncs. Its data is kept, so it can be brought back. */
  async archive(id: string): Promise<void> {
    const p = await this.load(id);
    if (p.isDefault) throw new BadRequestException('The first profile cannot be archived');
    await this.model.updateOne({ _id: p._id }, { $set: { archived: true } });
    await this.refresh();
  }

  private async load(id: string): Promise<ProfileDocument> {
    if (!isValidObjectId(id)) throw new NotFoundException('Profile not found');
    const p = this.byId(id) ?? (await this.model.findById(id));
    if (!p) throw new NotFoundException('Profile not found');
    return p;
  }

  /**
   * Runs at every start and does nothing once done: creates the first profile from the data and settings that exist today,
   * stamps every old document with it, gives every user access, and rebuilds indexes so uniqueness is per profile.
   */
  async migrate() {
    let def = await this.model.findOne({ isDefault: true });
    if (!def) {
      const settings: Record<string, string> = {};
      const old = this.connection.collection('appsettings');
      const rows = await old.find({ key: { $regex: '^cfg\\.' } }).toArray();
      for (const r of rows) settings[String(r.key).slice(4)] = String(r.value);
      if (!settings.SITE_NAME) settings.SITE_NAME = DEFAULT_PROFILE_NAME;
      def = await this.model.create({ name: settings.SITE_NAME, isDefault: true, settings });
      if (rows.length) await old.deleteMany({ key: { $regex: '^cfg\\.' } });
      this.logger.log(`Created the first profile "${def.name}" from the existing settings`);
    }
    const id = def.id as string;

    // Native collection calls on purpose: this is the one place that may touch every profile's data.
    for (const c of SCOPED_COLLECTIONS) {
      const res = await this.connection.collection(c).updateMany({ profileId: { $exists: false } }, { $set: { profileId: id } });
      if (res.modifiedCount) this.logger.log(`Moved ${res.modifiedCount} ${c} document(s) into the first profile`);
    }
    // The finding counter becomes one per profile.
    const counters = this.connection.collection('counters');
    const legacy = await counters.findOne({ _id: 'finding' as never });
    if (legacy) {
      await counters.updateOne({ _id: `finding:${id}` as never }, { $setOnInsert: { seq: legacy.seq } }, { upsert: true });
      await counters.deleteOne({ _id: 'finding' as never });
    }
    // Everyone who could sign in keeps their role in the first profile; today's admins become super admins.
    const users = this.connection.collection('users');
    await users.updateMany({ superAdmin: { $exists: false }, role: 'admin' }, { $set: { superAdmin: true } });
    await users.updateMany({ superAdmin: { $exists: false } }, { $set: { superAdmin: false } });
    await users.updateMany({ memberships: { $exists: false } }, [{ $set: { memberships: [{ profileId: id, role: '$role' }] } }]);

    for (const m of SCOPED_MODELS) {
      try { await this.connection.models[m]?.syncIndexes(); } catch (err) { this.logger.error(`Could not rebuild indexes for ${m}: ${(err as Error).message}`); }
    }
  }
}
