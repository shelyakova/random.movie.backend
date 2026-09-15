import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilmService } from './film.service.js';
import { CreateFilmDto, EditFilmDto, GetFilmsQueryDto } from './dto/film.dto.js';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../decorator/index.js';
import type { User } from '../generated/prisma/client.js';
import { FileInterceptor } from '@nestjs/platform-express';
import 'multer';

@UseGuards(AuthGuard('jwt'))
@Controller('film')
export class FilmController {
  constructor(private filmService: FilmService) { }

  @Get()
  getAll(@GetUser() user: User, @Query() query: GetFilmsQueryDto) {
    return this.filmService.getAll(user.id, query);
  }

  @Get('random')
  getRandom(
    @GetUser() user: User,
    @Query('search') search?: string,
    @Query('categoryIds') categoryIds?: string[],
    @Query('newSeasonOut') newSeasonOut?: string,
    @Query('hasLatestEpisode') hasLatestEpisode?: string,
  ) {
    const ids = categoryIds
      ? (Array.isArray(categoryIds) ? categoryIds : [categoryIds]).map(Number)
      : undefined;
    return this.filmService.getRandom(
      user.id,
      search,
      ids,
      newSeasonOut === 'true',
      hasLatestEpisode === 'true',
    );
  }

  @Get(':id')
  getById(@GetUser() user: User, @Param('id', ParseIntPipe) filmId: number) {
    return this.filmService.getById(filmId, user.id);
  }

  @Post(':id/poster')
  @UseInterceptors(FileInterceptor('poster', {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, callback) => {
      if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
        return callback(new BadRequestException('Only image files are allowed'), false);
      }
      callback(null, true);
    },
  }))
  uploadPoster(
    @Param('id', ParseIntPipe) filmId: number,
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: User,
  ) {
    return this.filmService.uploadPoster(filmId, file, user.id);
  }

  @Post('create')
  create(@GetUser() user: User, @Body() dto: CreateFilmDto) {
    return this.filmService.create(dto, user.id);
  }

  @Patch(':id')
  edit(@GetUser() user: User, @Body() dto: EditFilmDto, @Param('id', ParseIntPipe) filmId: number) {
    return this.filmService.edit(dto, filmId, user.id);
  }

  @Delete(':id')
  delete(@GetUser() user: User, @Param('id', ParseIntPipe) filmId: number) {
    return this.filmService.delete(filmId, user.id);
  }
}
