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
import { MetricSnapshot, MetricSnapshotSchema, SyncRun, SyncRunSchema } from './analytics.schema';
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
    ]),
  ],
  controllers: [AnalyticsController, DashboardController, AnnotationsController, Ga4Controller],
  providers: [ClarityClient, ClaritySyncService, Ga4Client, Ga4SyncService, DashboardService, ExploreService, AnnotationsService, FindingLinksService, MaintenanceService],
  exports: [ClaritySyncService, Ga4SyncService],
})
export class AnalyticsModule {}
