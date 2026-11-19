import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { AuthUser } from '../common/decorators';
import { Annotation, AnnotationDocument } from './annotations.schema';

export interface AnnotationDto {
  id: string;
  date: string;
  label: string;
  kind: string;
  createdBy: string;
}

@Injectable()
export class AnnotationsService {
  constructor(@InjectModel(Annotation.name) private readonly model: Model<AnnotationDocument>) {}

  private toDto(a: AnnotationDocument): AnnotationDto {
    return { id: a.id, date: a.date, label: a.label, kind: a.kind, createdBy: a.createdByName };
  }

  async list(from: string, to: string): Promise<AnnotationDto[]> {
    const items = await this.model.find({ date: { $gte: from, $lte: to } }).sort({ date: 1, createdAt: 1 });
    return items.map((a) => this.toDto(a));
  }

  async create(input: { date: string; label: string; kind: string }, user: AuthUser) {
    const a = await this.model.create({ ...input, createdById: user.id, createdByName: user.name });
    return this.toDto(a);
  }

  async remove(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Marker not found');
    const gone = await this.model.findByIdAndDelete(id);
    if (!gone) throw new NotFoundException('Marker not found');
  }
}
