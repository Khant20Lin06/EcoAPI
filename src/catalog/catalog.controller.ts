import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { ListProductsQueryDto } from './dto/list-products.dto';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('products')
  listProducts(@Query() query: ListProductsQueryDto) {
    return this.catalogService.listProducts(query);
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string, @Query('locale') locale?: string) {
    return this.catalogService.getProduct(id, locale);
  }

  @Get('categories')
  listCategories(@Query('locale') locale?: string) {
    return this.catalogService.listCategories(locale);
  }

  @Get('tags')
  listTags(@Query('locale') locale?: string) {
    return this.catalogService.listTags(locale);
  }
}
