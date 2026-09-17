import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateFilmDto, EditFilmDto, GetFilmsQueryDto } from './dto/film.dto.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';

@Injectable()
export class FilmService {
    constructor(
        private prisma: PrismaService,
        private cloudinaryService: CloudinaryService
    ) { }

    async getAll(userId: number, query: GetFilmsQueryDto) {
        const { search, isWatched, categoryIds, newSeasonOut, page = 1, hasLatestEpisode, limit = 10 } = query;
      
        return this.prisma.film.findMany({
          where: {
            userId,
            ...(search && {
              name: { contains: search, mode: 'insensitive' },
            }),
            ...(isWatched !== undefined && { isWatched }),
            ...(categoryIds && {
              AND: categoryIds.map((id) => ({
                categories: { some: { id } },
              })),
            }),
            ...(newSeasonOut && { newSeason: { not: null, lte: new Date() } }),
            ...(hasLatestEpisode && { latestEpisode: { not: null } }),
          },
          include: { categories: true },
          skip: (page - 1) * limit,
          take: limit,
        });
      }

      async getRandom(
        userId: number,
        search?: string,
        categoryIds?: number[],
        newSeasonOut?: boolean,
        hasLatestEpisode?: boolean,
      ) {
        const films = await this.prisma.film.findMany({
          where: {
            userId,
            isWatched: false,
            ...(search && { name: { contains: search, mode: 'insensitive' } }),
            ...(categoryIds && categoryIds.length > 0 && {
              AND: categoryIds.map((id) => ({ categories: { some: { id } } })),
            }),
            ...(newSeasonOut && { newSeason: { not: null, lte: new Date() } }),
            ...(hasLatestEpisode && { latestEpisode: { not: null } }),
          },
          select: { id: true },
        });
      
        if (films.length === 0) {
          throw new NotFoundException('No unwatched films found matching the current filters');
        }
      
        const randomIndex = Math.floor(Math.random() * films.length);
        return films[randomIndex];
      }

    async getById(filmId: number, userId: number) {
        const film = await this.prisma.film.findFirst({
            where: { id: filmId, userId },
            include: { categories: true },
        });

        if (!film) {
            throw new NotFoundException('Film not found');
        }

        return film;
    }

    async uploadPoster(filmId: number, file: Express.Multer.File, userId: number) {
      const film = await this.prisma.film.findFirst({ where: { id: filmId, userId } });
      if (!film) {
        throw new NotFoundException('Film not found');
      }
    
      if (film.posterPublicId) {
        await this.cloudinaryService.deleteImage(film.posterPublicId);
      }
    
      const { url, publicId } = await this.cloudinaryService.uploadImage(file);
    
      return this.prisma.film.update({
        where: { id: filmId },
        data: { posterUrl: url, posterPublicId: publicId },
      });
    }
    
    async uploadPosterFromUrl(filmId: number, posterUrl: string, userId: number) {
      const film = await this.prisma.film.findFirst({ where: { id: filmId, userId } });
      if (!film) {
        throw new NotFoundException('Film not found');
      }
    
      if (film.posterPublicId) {
        await this.cloudinaryService.deleteImage(film.posterPublicId);
      }
    
      const { url, publicId } = await this.cloudinaryService.uploadImageFromUrl(posterUrl);
    
      return this.prisma.film.update({
        where: { id: filmId },
        data: { posterUrl: url, posterPublicId: publicId },
      });
    }
    
    async removePoster(filmId: number, userId: number) {
      const film = await this.prisma.film.findFirst({ where: { id: filmId, userId } });
      if (!film) {
        throw new NotFoundException('Film not found');
      }
    
      if (film.posterPublicId) {
        await this.cloudinaryService.deleteImage(film.posterPublicId);
      }
    
      return this.prisma.film.update({
        where: { id: filmId },
        data: { posterUrl: null, posterPublicId: null },
      });
    }

    async create(dto: CreateFilmDto, userId: number) {
        const { categoryIds, newSeason, latestEpisode, ...filmData } = dto;

        return this.prisma.film.create({
            data: {
              ...filmData,
              userId,
              newSeason: newSeason === undefined ? undefined : newSeason ? new Date(newSeason).toISOString() : null,
              latestEpisode: latestEpisode === undefined ? undefined : latestEpisode ? new Date(latestEpisode).toISOString() : null,
              categories: categoryIds ? { connect: categoryIds.map((id) => ({ id })) } : undefined,
            },
            include: { categories: true },
          });
    }

    async edit(dto: EditFilmDto, filmId: number, userId: number) {
        const film = await this.prisma.film.findFirst({
            where: { id: filmId, userId },
        });

        if (!film) {
            throw new NotFoundException('Film not found');
        }

        const { categoryIds, newSeason, latestEpisode, ...filmData } = dto;

        return this.prisma.film.update({
            where: { id: filmId },
            data: {
            ...filmData,
            newSeason: newSeason === undefined ? undefined : newSeason ? new Date(newSeason).toISOString() : null,
            latestEpisode: latestEpisode === undefined ? undefined : latestEpisode ? new Date(latestEpisode).toISOString() : null,
            categories: categoryIds ? { set: categoryIds.map((catId) => ({ id: catId })) } : undefined,
            },
            include: { categories: true },
        });
    }

    async delete(filmId: number, userId: number) {
        const film = await this.prisma.film.findFirst({
            where: { id: filmId, userId },
        });

        if (!film) {
            throw new NotFoundException('Film not found');
        }

        return this.prisma.film.delete({ where: { id: filmId } });
    }
}