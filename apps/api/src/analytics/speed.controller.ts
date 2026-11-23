import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, MinRole } from '../common/decorators';
import { Role } from '../common/roles';
import { SpeedRunDto, SpeedSettingsDto, SpeedSummaryQuery, SpeedTargetDto } from './speed.dto';
import { SpeedService } from './speed.service';

@Controller('speed')
export class SpeedController {
  constructor(private readonly speed: SpeedService) {}

  /** The pages checked every day, plus whether the data source is set up. */
  @Get('targets')
  async targets() {
    return { targets: await this.speed.listTargets(), configured: this.speed.configured, problem: this.speed.problem, dailyTime: await this.speed.dailyTime() };
  }

  /** Change when the daily check runs (Bangladesh time). */
  @Put('settings')
  @MinRole(Role.Admin)
  async settings(@Body() dto: SpeedSettingsDto) {
    return { dailyTime: await this.speed.setDailyTime(dto.dailyTime) };
  }

  @Post('targets')
  @MinRole(Role.Admin)
  add(@Body() dto: SpeedTargetDto, @CurrentUser() me: AuthUser) {
    return this.speed.addTarget(dto.url, dto.label, me.email);
  }

  @Delete('targets/:id')
  @MinRole(Role.Admin)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.speed.removeTarget(id);
  }

  @Get('summary')
  summary(@Query() q: SpeedSummaryQuery) {
    return this.speed.summary(q);
  }

  /** Test one page now (any public address). Answers at once; poll `jobs/:id` for the outcome. */
  @Post('run')
  @MinRole(Role.Editor)
  @HttpCode(202)
  run(@Body() dto: SpeedRunDto, @CurrentUser() me: AuthUser) {
    return this.speed.startManual(dto.url, dto.strategy, me.email);
  }

  @Get('jobs/:id')
  job(@Param('id') id: string) {
    return this.speed.getJob(id);
  }

  /** Run the whole daily check now. */
  @Post('run-all')
  @MinRole(Role.Admin)
  @HttpCode(202)
  runAll() {
    return this.speed.startRunAll();
  }
}
