import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Finding, FindingDocument } from '../findings/finding.schema';

/** Open findings (new or planned) per page address, so the page tables can show them. */
@Injectable()
export class FindingLinksService {
  constructor(@InjectModel(Finding.name) private readonly model: Model<FindingDocument>) {}

  async openCountsByPage(): Promise<Map<string, number>> {
    const rows = await this.model.aggregate<{ _id: string; n: number }>([
      { $match: { pageUrl: { $exists: true, $nin: ['', null] }, status: { $in: ['new', 'planned'] } } },
      { $group: { _id: '$pageUrl', n: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [r._id, r.n]));
  }
}
