import { Module } from '@nestjs/common';
import { TmdbController } from './tmdb.controller.js';
import { TmdbService } from './tmdb.service.js';

@Module({
  controllers: [TmdbController],
  providers: [TmdbService],
})
export class TmdbModule {}