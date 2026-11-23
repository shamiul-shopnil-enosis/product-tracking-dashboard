import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { FindingsModule } from './findings/findings.module';
import { HealthModule } from './health/health.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI', 'mongodb://localhost:27017/product_tracking'),
        serverSelectionTimeoutMS: 5000,
      }),
    }),
    SettingsModule,
    HealthModule,
    UsersModule,
    AuthModule,
    FindingsModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
