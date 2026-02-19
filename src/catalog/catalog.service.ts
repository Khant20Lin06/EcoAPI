import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListProductsQueryDto } from './dto/list-products.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(query: ListProductsQueryDto) {
    const locale = this.resolveLocale(query.locale);
    const limit = query.limit ?? 20;
    const and: Record<string, unknown>[] = [{ status: ProductStatus.ACTIVE }];

    if (query.q) {
      and.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } }
        ]
      });
    }

    if (query.categoryId) {
      and.push({ categoryId: query.categoryId });
    }

    if (query.tagIds && query.tagIds.length > 0) {
      and.push({
        tags: {
          some: {
            tagId: { in: query.tagIds }
          }
        }
      });
    }

    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      and.push({
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          {
            createdAt: new Date(cursor.createdAt),
            id: { lt: cursor.id }
          }
        ]
      });
    }

    const items = await this.prisma.product.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        images: true,
        variants: true,
        tags: {
          include: { tag: true }
        }
      }
    });

    const hasNext = items.length > limit;
    const pageItems = hasNext ? items.slice(0, limit) : items;
    const lastItem = pageItems.at(-1);
    const nextCursor = hasNext && lastItem ? this.encodeCursor(lastItem) : null;

    return {
      items: pageItems.map((item) => ({
        ...item,
        tags: item.tags.map((productTag) => ({
          ...productTag,
          tag: {
            ...productTag.tag,
            name: this.pickLocalizedName(locale, productTag.tag)
          }
        }))
      })),
      nextCursor
    };
  }

  async getProduct(id: string, localeRaw?: string) {
    const locale = this.resolveLocale(localeRaw);
    const product = await this.prisma.product.findFirst({
      where: { id, status: ProductStatus.ACTIVE },
      include: {
        images: true,
        variants: true,
        tags: { include: { tag: true } },
        category: true,
        vendor: true
      }
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return {
      ...product,
      category: {
        ...product.category,
        name: this.pickLocalizedName(locale, product.category)
      },
      tags: product.tags.map((productTag) => ({
        ...productTag,
        tag: {
          ...productTag.tag,
          name: this.pickLocalizedName(locale, productTag.tag)
        }
      }))
    };
  }

  async listCategories(localeRaw?: string) {
    const locale = this.resolveLocale(localeRaw);
    const items = await this.prisma.category.findMany({
      orderBy: { name: 'asc' }
    });
    return {
      items: items.map((item) => ({
        ...item,
        name: this.pickLocalizedName(locale, item)
      }))
    };
  }

  async listTags(localeRaw?: string) {
    const locale = this.resolveLocale(localeRaw);
    const items = await this.prisma.sustainabilityTag.findMany({
      where: { active: true },
      orderBy: { name: 'asc' }
    });
    return {
      items: items.map((item) => ({
        ...item,
        name: this.pickLocalizedName(locale, item)
      }))
    };
  }

  private encodeCursor(product: { createdAt: Date; id: string }) {
    const payload: CursorPayload = {
      createdAt: product.createdAt.toISOString(),
      id: product.id
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private decodeCursor(cursor: string): CursorPayload {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    return JSON.parse(raw) as CursorPayload;
  }

  private resolveLocale(locale?: string): 'en' | 'my' {
    return locale === 'my' ? 'my' : 'en';
  }

  private pickLocalizedName(
    locale: 'en' | 'my',
    target: { en_name: string; mm_name: string; name?: string }
  ) {
    if (locale === 'my') {
      return target.mm_name || target.en_name || target.name || '';
    }
    return target.en_name || target.mm_name || target.name || '';
  }
}
