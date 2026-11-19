import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { MinRole } from '../common/decorators';
import { Role } from '../common/roles';
import { ManualSyncDto } from './analytics.dto';
import { ClaritySyncService } from './clarity-sync.service';
import type { BreakdownKey } from './clarity.constants';

// Raw analytics and sync controls are admin-only. The dashboard pages (Phase 4) get their own read endpoints.
@Controller('analytics/clarity')
@MinRole(Role.Admin)
export class AnalyticsController {
  constructor(private readonly clarity: ClaritySyncService) {}

  @Get('status')
  status() {
    return this.clarity.status();
  }

  @Get('runs')
  runs() {
    return this.clarity.recentRuns(10);
  }

  @Post('sync')
  async sync(@Body() dto: ManualSyncDto) {
    const keys = (dto.breakdowns?.length ? dto.breakdowns : ['none']) as BreakdownKey[];
    return this.clarity.toRunDto(await this.clarity.manual(keys));
  }

  @Post('probe')
  async probe() {
    return this.clarity.toRunDto(await this.clarity.probe());
  }

  @Get('snapshots')
  snapshots(@Query('limit') limit?: string) {
    return this.clarity.listSnapshots(Math.min(Number(limit) || 50, 200));
  }

  @Get('snapshots/:id')
  async snapshot(@Param('id') id: string) {
    const s = isValidObjectId(id) ? await this.clarity.getSnapshot(id) : null;
    if (!s) throw new NotFoundException('Snapshot not found');
    return s;
  }
}
