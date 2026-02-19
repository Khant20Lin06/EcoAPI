import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        product: {
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
            variants: { orderBy: { createdAt: 'asc' }, take: 1 },
            vendor: {
              select: {
                id: true,
                name: true
              }
            },
            category: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          }
        }
      }
    });

    return { items };
  }

  async add(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        status: ProductStatus.ACTIVE
      },
      select: { id: true }
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const item = await this.prisma.wishlistItem.upsert({
      where: {
        userId_productId: {
          userId,
          productId
        }
      },
      update: {},
      create: {
        userId,
        productId
      },
      include: {
        product: {
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
            variants: { orderBy: { createdAt: 'asc' }, take: 1 }
          }
        }
      }
    });

    return item;
  }

  async remove(userId: string, productId: string) {
    const existing = await this.prisma.wishlistItem.findFirst({
      where: { userId, productId },
      select: { id: true }
    });

    if (!existing) {
      return { ok: true };
    }

    await this.prisma.wishlistItem.delete({ where: { id: existing.id } });
    return { ok: true };
  }
}

