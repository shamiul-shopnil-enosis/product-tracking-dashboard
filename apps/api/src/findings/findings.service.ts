import { requireProfileId } from '../profiles/profile-context';
import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { isValidObjectId, Model } from 'mongoose';
import * as path from 'path';
import { AuthUser } from '../common/decorators';
import { detectImage } from './attachments';
import { Counter, CounterDocument, Finding, FindingDocument } from './finding.schema';
import { CreateFindingDto, ListFindingsQuery, UpdateFindingDto } from './findings.dto';
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from './findings.constants';
import { pageUrlProblem, stateProblems } from './findings.rules';
import { normalizeUrl } from '../analytics/aggregate';
import { BAND_RANK, computePriority } from './priority';
import type { Band, Effort, Reach } from './findings.constants';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class FindingsService {
  private readonly uploadsDir: string;

  constructor(
    @InjectModel(Finding.name) private readonly model: Model<FindingDocument>,
    @InjectModel(Counter.name) private readonly counters: Model<CounterDocument>,
    config: ConfigService,
  ) {
    this.uploadsDir = path.resolve(config.get<string>('UPLOADS_DIR', './uploads'));
  }

  // ---- mapping ----

  toDto(f: FindingDocument) {
    return {
      id: f.id,
      ref: f.ref,
      title: f.title,
      type: f.type,
      where: f.where,
      description: f.description,
      whyItMatters: f.whyItMatters,
      severity: f.severity,
      reach: f.reach,
      effort: f.effort,
      suggestedChange: f.suggestedChange,
      surface: f.surface,
      firstMetric: f.firstMetric,
      status: f.status,
      plannedRelease: f.plannedRelease,
      ignoredReason: f.ignoredReason,
      githubUrl: f.githubUrl,
      pageUrl: f.pageUrl ?? '',
      evidenceLinks: (f.evidenceLinks ?? []).map((l) => ({ label: l.label, url: l.url })),
      attachments: (f.attachments ?? []).map((a) => ({
        id: String((a as unknown as { _id: unknown })._id),
        filename: a.filename,
        mime: a.mime,
        size: a.size,
        uploadedAt: a.uploadedAt,
      })),
      resultCheck: f.resultCheck ?? null,
      priority: {
        computedScore: f.computedScore,
        computedBand: f.computedBand,
        overrideScore: f.overrideScore,
        overrideBand: f.overrideBand,
        overrideReason: f.overrideReason,
        score: f.effectiveScore,
        band: f.effectiveBand,
      },
      createdBy: { id: f.createdById, name: f.createdByName },
      createdAt: (f as unknown as { createdAt: Date }).createdAt,
      updatedAt: (f as unknown as { updatedAt: Date }).updatedAt,
    };
  }

  /** Recompute the priority fields from severity, reach, effort and any override. */
  private applyPriority(f: FindingDocument) {
    const p = computePriority(f.severity, f.reach as Reach, f.effort as Effort);
    f.computedScore = p.score;
    f.computedBand = p.band;
    f.effectiveScore = f.overrideScore ?? p.score;
    f.effectiveBand = f.overrideBand ?? p.band;
    f.effectiveBandRank = BAND_RANK[f.effectiveBand as Band];
  }

  private assertValid(f: FindingDocument) {
    const problems = stateProblems({
      status: f.status,
      plannedRelease: f.plannedRelease ?? '',
      ignoredReason: f.ignoredReason ?? '',
      githubUrl: f.githubUrl ?? '',
    });
    const pageProblem = pageUrlProblem(f.pageUrl ?? '');
    if (pageProblem) problems.push(pageProblem);
    if (problems.length) throw new BadRequestException(problems);
  }

  private async nextRef(): Promise<number> {
    const c = await this.counters.findOneAndUpdate(
      { _id: `finding:${requireProfileId()}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );
    return c.seq;
  }

  private async load(id: string): Promise<FindingDocument> {
    if (!isValidObjectId(id)) throw new NotFoundException('Finding not found');
    const f = await this.model.findById(id);
    if (!f) throw new NotFoundException('Finding not found');
    return f;
  }

  // ---- queries ----

  async list(q: ListFindingsQuery) {
    const filter: Record<string, unknown> = {};
    if (q.type) filter.type = q.type;
    if (q.severity) filter.severity = q.severity;
    if (q.reach) filter.reach = q.reach;
    if (q.status) filter.status = q.status;
    if (q.band) filter.effectiveBand = q.band;
    if (q.surface) filter.surface = new RegExp(`^${escapeRegex(q.surface)}$`, 'i');
    if (q.release) filter.plannedRelease = q.release;
    if (q.pageUrl) filter.pageUrl = normalizeUrl(q.pageUrl);
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ title: rx }, { where: rx }, { description: rx }];
    }
    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const sort: Record<string, 1 | -1> =
      q.sort === 'newest' ? { createdAt: -1 } : { effectiveBandRank: -1, effectiveScore: -1, createdAt: -1 };
    const [items, total] = await Promise.all([
      this.model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
      this.model.countDocuments(filter),
    ]);
    return { items: items.map((f) => this.toDto(f)), total, page, limit };
  }

  async get(id: string) {
    return this.toDto(await this.load(id));
  }

  /** Counts for the Overview: findings still open, and how many shipped in the last 30 days. */
  async summary() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [byStatus, shipped30] = await Promise.all([
      this.model.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      this.model.countDocuments({ status: 'shipped', shippedAt: { $gte: since } }),
    ]);
    const n = (s: string) => byStatus.find((r) => r._id === s)?.n ?? 0;
    return { new: n('new'), planned: n('planned'), open: n('new') + n('planned'), shipped: n('shipped'), ignored: n('ignored'), shippedLast30Days: shipped30 };
  }

  // ---- writes ----

  async create(dto: CreateFindingDto, user: AuthUser) {
    const f = new this.model({
      ref: 0, // assigned after validation, so a rejected create does not use up a number
      title: dto.title,
      type: dto.type,
      where: dto.where,
      description: dto.description ?? '',
      whyItMatters: dto.whyItMatters ?? '',
      severity: dto.severity,
      reach: dto.reach,
      effort: dto.effort,
      suggestedChange: dto.suggestedChange ?? '',
      surface: dto.surface ?? '',
      firstMetric: dto.firstMetric ?? '',
      status: dto.status ?? 'new',
      plannedRelease: dto.plannedRelease ?? '',
      ignoredReason: dto.ignoredReason ?? '',
      githubUrl: dto.githubUrl ?? '',
      pageUrl: dto.pageUrl ?? '',
      evidenceLinks: dto.evidenceLinks ?? [],
      resultCheck: dto.resultCheck,
      overrideScore: dto.overrideScore ?? null,
      overrideBand: dto.overrideBand ?? null,
      overrideReason: dto.overrideReason ?? '',
      createdById: user.id,
      createdByName: user.name,
    });
    this.applyPriority(f);
    this.assertValid(f);
    if (f.pageUrl) f.pageUrl = normalizeUrl(f.pageUrl);
    if (f.status === 'shipped') f.shippedAt = new Date();
    f.ref = await this.nextRef();
    await f.save();
    return this.toDto(f);
  }

  async update(id: string, dto: UpdateFindingDto) {
    const f = await this.load(id);
    const wasShipped = f.status === 'shipped';
    const scalar = [
      'title', 'type', 'where', 'description', 'whyItMatters', 'severity', 'reach', 'effort',
      'suggestedChange', 'surface', 'firstMetric', 'status', 'plannedRelease', 'ignoredReason',
      'githubUrl', 'pageUrl', 'overrideScore', 'overrideBand', 'overrideReason',
    ] as const;
    for (const k of scalar) {
      if (dto[k] !== undefined) (f as unknown as Record<string, unknown>)[k] = dto[k];
    }
    if (dto.evidenceLinks) f.evidenceLinks = dto.evidenceLinks as never;
    if (dto.resultCheck) f.resultCheck = dto.resultCheck as never;
    // Leaving "ignored" clears the reason so a stale one never shows on an active finding.
    if (dto.status && dto.status !== 'ignored' && dto.ignoredReason === undefined) f.ignoredReason = '';
    this.applyPriority(f);
    this.assertValid(f);
    if (f.pageUrl) f.pageUrl = normalizeUrl(f.pageUrl);
    if (dto.status === 'shipped' && wasShipped === false) f.shippedAt = new Date();
    await f.save();
    return this.toDto(f);
  }

  async remove(id: string) {
    const f = await this.load(id);
    await Promise.all(f.attachments.map((a) => fs.rm(this.filePath(a.storedName), { force: true })));
    await f.deleteOne();
  }

  // ---- attachments ----

  private filePath(storedName: string) {
    return path.join(this.uploadsDir, path.basename(storedName));
  }

  async addAttachment(id: string, file: { buffer: Buffer; originalname: string; size: number } | undefined, user: AuthUser) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.size > MAX_ATTACHMENT_BYTES) throw new PayloadTooLargeException('File is larger than 5 MB');
    const kind = detectImage(file.buffer);
    if (!kind) throw new BadRequestException('Only PNG, JPG and WebP images are allowed');

    const f = await this.load(id);
    if (f.attachments.length >= MAX_ATTACHMENTS) {
      throw new BadRequestException(`A finding can have at most ${MAX_ATTACHMENTS} screenshots`);
    }
    const storedName = `${randomUUID()}.${kind.ext}`;
    await fs.mkdir(this.uploadsDir, { recursive: true });
    await fs.writeFile(this.filePath(storedName), file.buffer, { flag: 'wx' });
    f.attachments.push({
      storedName,
      filename: path.basename(file.originalname).slice(0, 200) || `screenshot.${kind.ext}`,
      mime: kind.mime,
      size: file.size,
      uploadedBy: user.id,
    } as never);
    await f.save();
    return this.toDto(f);
  }

  async getAttachmentFile(id: string, attId: string) {
    const f = await this.load(id);
    const a = f.attachments.find((x) => String((x as unknown as { _id: unknown })._id) === attId);
    if (!a) throw new NotFoundException('Attachment not found');
    return { path: this.filePath(a.storedName), mime: a.mime, filename: a.filename };
  }

  async removeAttachment(id: string, attId: string) {
    const f = await this.load(id);
    const a = f.attachments.find((x) => String((x as unknown as { _id: unknown })._id) === attId);
    if (!a) throw new NotFoundException('Attachment not found');
    await fs.rm(this.filePath(a.storedName), { force: true });
    f.attachments = f.attachments.filter((x) => x !== a) as never;
    await f.save();
    return this.toDto(f);
  }
}
