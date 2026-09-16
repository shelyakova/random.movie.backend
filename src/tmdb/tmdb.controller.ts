import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TmdbService } from './tmdb.service.js';
import { TmdbSearchQueryDto, TmdbDetailsParamsDto } from './dto/tmdb.dto.js';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('tmdb')
export class TmdbController {
  constructor(private readonly tmdbService: TmdbService) {}

  @Get('search')
  search(@Query() query: TmdbSearchQueryDto) {
    return this.tmdbService.search(query.query);
  }

  @Get('details/:type/:id')
  getDetails(@Param() params: TmdbDetailsParamsDto) {
    return this.tmdbService.getDetails(params.type, params.id);
  }
}