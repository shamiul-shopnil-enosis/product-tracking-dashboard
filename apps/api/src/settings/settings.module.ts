import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppSetting, AppSettingSchema } from '../analytics/analytics.schema';
import { RuntimeConfig } from './runtime-config';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: AppSetting.name, schema: AppSettingSchema }])],
  providers: [RuntimeConfig],
  exports: [RuntimeConfig],
})
export class SettingsModule {}
