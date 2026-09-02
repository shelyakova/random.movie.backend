import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CategoryDto } from './dto/category.dto.js';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

@Injectable()
export class CategoryService {
    constructor(
        private prisma: PrismaService,
    ) { }

    async getAll(userId: number) {
        return this.prisma.category.findMany({
            where: {
                userId,
            },
        });
    }

    async create(dto: CategoryDto, userId: number) {
        try {
            return await this.prisma.category.create({
                data: {
                    ...dto,
                    userId,
                },
            });
        } catch (error) {
            if (
                error instanceof PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ForbiddenException('Category name already exists');
            }
            throw error;
        }
    }

    async edit(dto: CategoryDto, categoryId: number, userId: number) {
        const category = await this.prisma.category.findFirst({
            where: { id: categoryId, userId },
        });

        if (!category) {
            throw new NotFoundException('Category not found');
        }

        return this.prisma.category.update({
            where: { id: categoryId },
            data: { ...dto },
        });
    }

    async delete(categoryId: number, userId: number) {
        const category = await this.prisma.category.findFirst({
            where: { id: categoryId, userId },
            include: { films: true },
        });

        if (!category) {
            throw new NotFoundException('Category not found');
        }

        if (category.films.length > 0) {
            throw new ForbiddenException('Category has films attached, remove them first');
        }

        return this.prisma.category.delete({ where: { id: categoryId } });
    }
}