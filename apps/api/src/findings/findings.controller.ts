import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthUser, CurrentUser, MinRole } from '../common/decorators';
import { Role } from '../common/roles';
import { MAX_ATTACHMENT_BYTES } from './findings.constants';
import { CreateFindingDto, ListFindingsQuery, UpdateFindingDto } from './findings.dto';
import { FindingsService } from './findings.service';

// Any signed-in user may read; writes need editor; hard delete needs admin.
@Controller('findings')
export class FindingsController {
  constructor(private readonly findings: FindingsService) {}

  @Get()
  list(@Query() q: ListFindingsQuery) {
    return this.findings.list(q);
  }

  @Get('summary')
  summary() {
    return this.findings.summary();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.findings.get(id);
  }

  @Post()
  @MinRole(Role.Editor)
  create(@Body() dto: CreateFindingDto, @CurrentUser() user: AuthUser) {
    return this.findings.create(dto, user);
  }

  @Patch(':id')
  @MinRole(Role.Editor)
  update(@Param('id') id: string, @Body() dto: UpdateFindingDto) {
    return this.findings.update(id, dto);
  }

  @Delete(':id')
  @MinRole(Role.Admin)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.findings.remove(id);
  }

  @Post(':id/attachments')
  @MinRole(Role.Editor)
  // No storage option: multer keeps the upload in memory by default, which is what we validate from.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }))
  upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.findings.addAttachment(id, file, user);
  }

  @Get(':id/attachments/:attId')
  async download(@Param('id') id: string, @Param('attId') attId: string, @Res() res: Response) {
    const f = await this.findings.getAttachmentFile(id, attId);
    res.set({
      'Content-Type': f.mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cache-Control': 'private, max-age=3600',
    });
    res.sendFile(f.path);
  }

  @Delete(':id/attachments/:attId')
  @MinRole(Role.Editor)
  removeAttachment(@Param('id') id: string, @Param('attId') attId: string) {
    return this.findings.removeAttachment(id, attId);
  }
}
