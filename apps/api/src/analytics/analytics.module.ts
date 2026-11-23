import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsController } from './analytics.controller';
import { AnnotationsController } from './annotations.controller';
import { Annotation, AnnotationSchema } from './annotations.schema';
import { AnnotationsService } from './annotations.service';
import { FindingLinksService } from './finding-links.service';
import { Finding, FindingSchema } from '../findings/finding.schema';
import { DashboardController } from './dashboard.controller';
import { Ga4Client } from './ga4.client';
import { Ga4Controller } from './ga4.controller';
import { Ga4SyncService } from './ga4-sync.service';
import { DashboardService } from './dashboard.service';
import { MaintenanceService } from './maintenance.service';
import { ExploreService } from './explore.service';
import {
  AppSetting, AppSettingSchema, MetricSnapshot, MetricSnapshotSchema, SpeedAudits, SpeedAuditsSchema, SpeedJob, SpeedJobSchema, SpeedResult, SpeedResultSchema,
  SpeedTarget, SpeedTargetSchema, SyncRun, SyncRunSchema,
} from './analytics.schema';
import { PsiClient } from './psi.client';
import { SpeedController } from './speed.controller';
import { SpeedService } from './speed.service';
import { DashboardLayout, DashboardLayoutSchema } from './layout.schema';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { LayoutController } from './layout.controller';
import { LayoutService } from './layout.service';
import { ClarityClient } from './clarity.client';
import { ClaritySyncService } from './clarity-sync.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: MetricSnapshot.name, schema: MetricSnapshotSchema },
      { name: SyncRun.name, schema: SyncRunSchema },
      { name: Annotation.name, schema: AnnotationSchema },
      { name: Finding.name, schema: FindingSchema },
      { name: SpeedTarget.name, schema: SpeedTargetSchema },
      { name: SpeedResult.name, schema: SpeedResultSchema },
      { name: SpeedAudits.name, schema: SpeedAuditsSchema },
      { name: SpeedJob.name, schema: SpeedJobSchema },
      { name: DashboardLayout.name, schema: DashboardLayoutSchema },
      { name: AppSetting.name, schema: AppSettingSchema },
    ]),
  ],
  controllers: [AnalyticsController, DashboardController, AnnotationsController, Ga4Controller, SpeedController, LayoutController, SettingsController],
  providers: [ClarityClient, ClaritySyncService, Ga4Client, Ga4SyncService, DashboardService, ExploreService, AnnotationsService, FindingLinksService, MaintenanceService, PsiClient, SpeedService, LayoutService, SettingsService],
  exports: [ClaritySyncService, Ga4SyncService, SpeedService, SettingsService],
})
export class AnalyticsModule {}
