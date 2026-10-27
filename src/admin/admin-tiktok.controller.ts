/// <reference types="multer" />
import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { tmpdir } from 'os';
import { Lang } from '../settings/settings.types';
import { TikTokTopic, TIKTOK_TOPICS } from '../tiktok/tiktok-writer';
import { TikTokDraftPatch, TikTokService } from '../tiktok/tiktok.service';
import { AdminGuard } from './admin.guard';

const LANGS: Lang[] = ['en', 'ru', 'es'];
/** Big enough for a TikTok video; images are much smaller. Files land in the temp dir first. */
const UPLOAD = { dest: tmpdir(), limits: { fileSize: 500 * 1024 * 1024, files: 35 } };

const wrap = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (err: any) {
    if (err?.getStatus) throw err;
    throw new BadRequestException(err?.message ?? String(err));
  }
};

/** Admin → TikTok: drafts, AI help, uploads and publishing. Slow steps return a job id to poll. */
@UseGuards(AdminGuard)
@Controller('admin/api/tiktok')
export class AdminTikTokController {
  constructor(private readonly tiktok: TikTokService) {}

  @Get()
  overview() {
    return wrap(() => this.tiktok.overview());
  }

  @Post('disconnect')
  async disconnect() {
    await this.tiktok.disconnect();
    return { ok: true };
  }

  @Post('ideas')
  ideas(@Body() body: { topic?: string; language?: string }) {
    const topic = TIKTOK_TOPICS.includes(body?.topic as TikTokTopic) ? (body.topic as TikTokTopic) : 'platform';
    const lang = LANGS.includes(body?.language as Lang) ? (body.language as Lang) : 'ru';
    return this.tiktok.startIdeas(topic, lang);
  }

  @Get('jobs/:id')
  job(@Param('id') id: string) {
    return this.tiktok.job(id);
  }

  @Post('posts')
  create(@Body() body: TikTokDraftPatch) {
    return wrap(() => this.tiktok.create(body ?? {}));
  }

  @Get('posts/:id')
  async get(@Param('id', ParseIntPipe) id: number) {
    return this.tiktok.view(await this.tiktok.get(id));
  }

  @Patch('posts/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: TikTokDraftPatch) {
    return wrap(() => this.tiktok.update(id, body ?? {}));
  }

  @Delete('posts/:id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.tiktok.remove(id);
    return { ok: true };
  }

  @Post('posts/:id/duplicate')
  duplicate(@Param('id', ParseIntPipe) id: number) {
    return wrap(() => this.tiktok.duplicate(id));
  }

  @Post('posts/:id/media')
  @UseInterceptors(FilesInterceptor('files', 35, UPLOAD))
  upload(@Param('id', ParseIntPipe) id: number, @UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('No files received');
    return wrap(() => this.tiktok.addMedia(id, files));
  }

  @Delete('posts/:id/media/:file')
  removeMedia(@Param('id', ParseIntPipe) id: number, @Param('file') file: string) {
    return wrap(() => this.tiktok.removeMedia(id, file));
  }

  @Post('posts/:id/order')
  reorder(@Param('id', ParseIntPipe) id: number, @Body() body: { files?: unknown }) {
    const files = Array.isArray(body?.files) ? body.files.filter((f): f is string => typeof f === 'string') : [];
    return wrap(() => this.tiktok.reorderMedia(id, files));
  }

  @Post('posts/:id/generate')
  generate(@Param('id', ParseIntPipe) id: number, @Body() body: { idea?: string }) {
    return this.tiktok.startGenerate(id, String(body?.idea ?? ''));
  }

  @Post('posts/:id/slides/:index/regenerate')
  regenerateSlide(@Param('id', ParseIntPipe) id: number, @Param('index', ParseIntPipe) index: number) {
    return this.tiktok.startRegenerateSlide(id, index);
  }

  @Post('posts/:id/publish')
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.tiktok.startPublish(id);
  }

  @Post('posts/:id/status')
  status(@Param('id', ParseIntPipe) id: number) {
    return wrap(() => this.tiktok.refreshStatus(id));
  }
}
