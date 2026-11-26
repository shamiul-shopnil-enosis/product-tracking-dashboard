import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Profile, ProfileSchema } from '../profiles/profile.schema';
import { ProfilesController } from '../profiles/profiles.controller';
import { ProfilesService } from '../profiles/profiles.service';
import { RuntimeConfig } from './runtime-config';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Profile.name, schema: ProfileSchema }])],
  controllers: [ProfilesController],
  providers: [RuntimeConfig, ProfilesService],
  exports: [RuntimeConfig, ProfilesService],
})
export class SettingsModule {}
