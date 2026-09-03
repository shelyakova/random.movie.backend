import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateFilmDto, EditFilmDto, GetFilmsQueryDto } from './dto/film.dto.js';

@Injectable()
export class FilmService {
    constructor(
        private prisma: PrismaService,
    ) { }

    async getAll(userId: number, query: GetFilmsQueryDto) {
        const { search, isWatched, categoryIds } = query;

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
            },
            include: { categories: true },
        });
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

    async create(dto: CreateFilmDto, userId: number) {
        const { categoryIds, ...filmData } = dto;

        return this.prisma.film.create({
            data: {
                ...filmData,
                userId,
                categories: categoryIds
                    ? { connect: categoryIds.map((id) => ({ id })) }
                    : undefined,
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

        const { categoryIds, ...filmData } = dto;

        return this.prisma.film.update({
            where: { id: filmId },
            data: {
                ...filmData,
                categories: categoryIds
                    ? { set: categoryIds.map((catId) => ({ id: catId })) }
                    : undefined,
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