import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { MinRole } from '../common/decorators';
import { Role } from '../common/roles';
import { Ga4SyncService } from './ga4-sync.service';

export class Ga4SyncDto {
  @IsOptional() @Type(() => Number) @IsIn([3, 30, 90]) days?: number;
}

// Sync controls are admin-only. The dashboard reads GA4 numbers through the dashboard endpoints.
@Controller('analytics/ga4')
@MinRole(Role.Admin)
export class Ga4Controller {
  constructor(private readonly ga4: Ga4SyncService) {}

  @Get('status')
  status() {
    return this.ga4.status();
  }

  @Get('runs')
  runs() {
    return this.ga4.recentRuns(10);
  }

  @Post('sync')
  async sync(@Body() dto: Ga4SyncDto) {
    return this.ga4.toRunDto(await this.ga4.manual(dto.days ?? 3));
  }
}
