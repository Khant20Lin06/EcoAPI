import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BlogsService } from './blogs.service';
import { ListBlogsQueryDto } from './dto/list-blogs-query.dto';

@ApiTags('blogs')
@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Get()
  list(@Query() query: ListBlogsQueryDto) {
    return this.blogsService.list(query);
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.blogsService.getBySlug(slug);
  }
}

