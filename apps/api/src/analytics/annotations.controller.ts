import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, MinRole } from '../common/decorators';
import { Role } from '../common/roles';
import { ANNOTATION_KINDS } from './annotations.schema';
import { AnnotationsService } from './annotations.service';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class CreateAnnotationDto {
  @Matches(DAY, { message: 'date must be YYYY-MM-DD' }) date: string;
  @IsString() @MinLength(1) @MaxLength(80) label: string;
  @IsIn(ANNOTATION_KINDS) kind: string;
}

export class AnnotationRangeQuery {
  @IsOptional() @Matches(DAY) from?: string;
  @IsOptional() @Matches(DAY) to?: string;
}

// Any signed-in user can see markers; editors and admins add and remove them.
@Controller('annotations')
export class AnnotationsController {
  constructor(private readonly annotations: AnnotationsService) {}

  @Get()
  list(@Query() q: AnnotationRangeQuery) {
    return this.annotations.list(q.from ?? '0000-01-01', q.to ?? '9999-12-31');
  }

  @Post()
  @MinRole(Role.Editor)
  create(@Body() dto: CreateAnnotationDto, @CurrentUser() user: AuthUser) {
    return this.annotations.create(dto, user);
  }

  @Delete(':id')
  @MinRole(Role.Editor)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.annotations.remove(id);
  }
}
