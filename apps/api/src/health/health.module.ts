import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SyncRun, SyncRunSchema } from '../analytics/analytics.schema';
import { HealthController } from './health.controller';

@Module({
  imports: [AnalyticsModule, MongooseModule.forFeature([{ name: SyncRun.name, schema: SyncRunSchema }])],
  controllers: [HealthController],
})
export class HealthModule {}
