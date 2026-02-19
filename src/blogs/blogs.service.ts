import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListBlogsQueryDto } from './dto/list-blogs-query.dto';

@Injectable()
export class BlogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListBlogsQueryDto) {
    const limit = query.limit ?? 12;
    const items = await this.prisma.blogPost.findMany({
      where: {
        publishedAt: {
          not: null
        }
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit
    });

    return { items };
  }

  async getBySlug(slug: string) {
    const item = await this.prisma.blogPost.findFirst({
      where: {
        slug,
        publishedAt: {
          not: null
        }
      }
    });

    if (!item) {
      throw new NotFoundException('Blog post not found');
    }

    return item;
  }
}

