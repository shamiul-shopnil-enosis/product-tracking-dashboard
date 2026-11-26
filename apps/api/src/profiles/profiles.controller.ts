import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, NoProfile, SuperAdminOnly } from '../common/decorators';
import { ProfilesService } from './profiles.service';

export class ProfileNameDto { @IsString() @MinLength(1) @MaxLength(80) name: string; }

@Controller('profiles')
@NoProfile()
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  /** The profiles the signed-in person may open. */
  @Get()
  list(@CurrentUser() me: AuthUser) {
    return this.profiles.accessibleTo(me);
  }

  /** All profiles with their ids, for the access screen. Super admins only. */
  @SuperAdminOnly()
  @Get('all')
  all() {
    return this.profiles.all().map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault }));
  }

  @SuperAdminOnly()
  @Post()
  async create(@Body() dto: ProfileNameDto) {
    const p = await this.profiles.create(dto.name);
    return { id: p.id, name: p.name, isDefault: p.isDefault };
  }

  @SuperAdminOnly()
  @Patch(':id')
  async rename(@Param('id') id: string, @Body() dto: ProfileNameDto) {
    const p = await this.profiles.rename(id, dto.name);
    return { id: p.id, name: p.name, isDefault: p.isDefault };
  }

  /** Hides a profile and stops its syncs; its data is kept. */
  @SuperAdminOnly()
  @Delete(':id')
  @HttpCode(204)
  async archive(@Param('id') id: string) {
    await this.profiles.archive(id);
  }
}
