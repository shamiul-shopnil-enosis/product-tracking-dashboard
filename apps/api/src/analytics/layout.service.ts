import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DashboardLayout, DashboardLayoutDocument } from './layout.schema';

/** The cards everyone starts with: the few things that matter most. */
export const DEFAULT_CARDS = ['live', 'sessions', 'ga4Users', 'ga4Engagement', 'ga4KeyEvents', 'orgSessions'];
export const MAX_CARDS = 24;
const KEY = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

export interface LayoutDto { cards: string[]; isDefault: boolean }

@Injectable()
export class LayoutService {
  constructor(@InjectModel(DashboardLayout.name) private readonly model: Model<DashboardLayoutDocument>) {}

  async get(userId: string): Promise<LayoutDto> {
    const doc = await this.model.findOne({ userId }).lean();
    return doc ? { cards: doc.cards, isDefault: false } : { cards: DEFAULT_CARDS, isDefault: true };
  }

  async set(userId: string, cards: string[]): Promise<LayoutDto> {
    if (!Array.isArray(cards) || cards.length > MAX_CARDS) throw new BadRequestException(`Choose at most ${MAX_CARDS} cards`);
    if (cards.some((c) => typeof c !== 'string' || !KEY.test(c))) throw new BadRequestException('Unknown card');
    const unique = [...new Set(cards)];
    await this.model.updateOne({ userId }, { $set: { cards: unique } }, { upsert: true });
    return { cards: unique, isDefault: false };
  }

  /** Back to the default view. */
  async reset(userId: string): Promise<LayoutDto> {
    await this.model.deleteOne({ userId });
    return { cards: DEFAULT_CARDS, isDefault: true };
  }
}
