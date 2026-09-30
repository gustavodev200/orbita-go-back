import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CATEGORIES, type Category } from './categories';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  @Get()
  list(): readonly Category[] {
    return CATEGORIES;
  }
}
