import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FilmService } from './film.service.js';
import { CreateFilmDto, EditFilmDto, GetFilmsQueryDto } from './dto/film.dto.js';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../decorator/index.js';
import type { User } from '../generated/prisma/client.js';

@UseGuards(AuthGuard('jwt'))
@Controller('film')
export class FilmController {
  constructor(private filmService: FilmService) { }

  @Get()
  getAll(@GetUser() user: User, @Query() query: GetFilmsQueryDto) {
    return this.filmService.getAll(user.id, query);
  }

  @Get(':id')
  getById(@GetUser() user: User, @Param('id', ParseIntPipe) filmId: number) {
    return this.filmService.getById(filmId, user.id);
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
