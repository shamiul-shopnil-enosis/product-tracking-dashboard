import { Body, Controller, Delete, Get, Put } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, SuperAdminOnly } from '../common/decorators';
import { SettingsService } from './settings.service';

export class SiteDto {
  @IsString() @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(300) url?: string;
}
export class ClarityDto { @IsString() @MaxLength(5000) token: string; }
export class ClarityProjectDto { @IsString() @MaxLength(500) value: string; }
export class Ga4Dto {
  @IsOptional() @IsString() @MaxLength(20) propertyId?: string;
  @IsOptional() @IsString() @MaxLength(20000) keyJson?: string;
}
export class PagespeedDto { @IsString() @MaxLength(100) apiKey: string; }

// Connections and the site name of the active profile. Super admins only; secret values can be replaced but are never sent back.
@Controller('settings')
@SuperAdminOnly()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get() view() { return this.settings.view(); }
  @Put('site') site(@Body() dto: SiteDto, @CurrentUser() me: AuthUser) { return this.settings.setSite(dto, me.email); }
  @Put('clarity') clarity(@Body() dto: ClarityDto, @CurrentUser() me: AuthUser) { return this.settings.setClarity(dto.token, me.email); }
  @Delete('clarity') clearClarity(@CurrentUser() me: AuthUser) { return this.settings.clearClarity(me.email); }
  @Put('clarity-project') clarityProject(@Body() dto: ClarityProjectDto, @CurrentUser() me: AuthUser) { return this.settings.setClarityProject(dto.value, me.email); }
  @Delete('clarity-project') clearClarityProject(@CurrentUser() me: AuthUser) { return this.settings.clearClarityProject(me.email); }
  @Put('ga4') ga4(@Body() dto: Ga4Dto, @CurrentUser() me: AuthUser) { return this.settings.setGa4(dto, me.email); }
  @Delete('ga4') clearGa4(@CurrentUser() me: AuthUser) { return this.settings.clearGa4(me.email); }
  @Put('pagespeed') pagespeed(@Body() dto: PagespeedDto, @CurrentUser() me: AuthUser) { return this.settings.setPagespeed(dto.apiKey, me.email); }
  @Delete('pagespeed') clearPagespeed(@CurrentUser() me: AuthUser) { return this.settings.clearPagespeed(me.email); }
}
