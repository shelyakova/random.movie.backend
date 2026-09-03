import { Module } from '@nestjs/common';
import { FilmController } from './film.controller.js';
import { FilmService } from './film.service.js';

@Module({
  controllers: [FilmController],
  providers: [FilmService],
})
export class FilmModule { }
