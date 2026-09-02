import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CategoryService } from './category.service.js';
import { CategoryDto } from './dto/category.dto.js';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../decorator/index.js';
import type { User } from '../generated/prisma/client.js';

@UseGuards(AuthGuard('jwt'))
@Controller('category')
export class CategoryController {
  constructor(private categoryService: CategoryService) { }

  @Get()
  getAll(@GetUser() user: User) {
    return this.categoryService.getAll(user.id);
  }

  @Post('create')
  create(@GetUser() user: User, @Body() dto: CategoryDto) {
    return this.categoryService.create(dto, user.id);
  }

  @Patch(':id')
  edit(@GetUser() user: User, @Body() dto: CategoryDto, @Param('id', ParseIntPipe) categoryId: number) {
    return this.categoryService.edit(dto, categoryId, user.id);
  }

  @Delete(':id')
  delete(@GetUser() user: User, @Param('id', ParseIntPipe) categoryId: number) {
    return this.categoryService.delete(categoryId, user.id);
  }
}