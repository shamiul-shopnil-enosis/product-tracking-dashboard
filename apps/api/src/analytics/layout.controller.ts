import { Body, Controller, Delete, Get, Put } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators';
import { LayoutService, MAX_CARDS } from './layout.service';

export class LayoutDto {
  @IsArray() @ArrayMaxSize(MAX_CARDS) @IsString({ each: true }) cards: string[];
}

// Every signed-in person arranges their own Overview, including viewers.
@Controller('dashboard-layout')
export class LayoutController {
  constructor(private readonly layout: LayoutService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.layout.get(user.id);
  }

  @Put()
  set(@Body() dto: LayoutDto, @CurrentUser() user: AuthUser) {
    return this.layout.set(user.id, dto.cards);
  }

  @Delete()
  reset(@CurrentUser() user: AuthUser) {
    return this.layout.reset(user.id);
  }
}
