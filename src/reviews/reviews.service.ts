import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateReviewDto) {
    const orderItem = await this.prisma.orderItem.findUnique({
      where: { id: dto.orderItemId },
      include: {
        order: {
          select: {
            id: true,
            userId: true,
            status: true,
          },
        },
      },
    });

    if (!orderItem) {
      throw new NotFoundException('Order item not found');
    }

    if (orderItem.order.userId !== userId) {
      throw new ForbiddenException('You can only review your own purchases');
    }

    const reviewableStatuses: OrderStatus[] = [
      OrderStatus.DELIVERED,
      OrderStatus.PICKED_UP,
      OrderStatus.RETURNED,
      OrderStatus.REFUNDED,
    ];
    if (!reviewableStatuses.includes(orderItem.order.status)) {
      throw new BadRequestException('Order item is not reviewable yet');
    }

    const existing = await this.prisma.review.findFirst({
      where: { orderItemId: dto.orderItemId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Only one review per order item is allowed');
    }

    return this.prisma.review.create({
      data: {
        orderItemId: dto.orderItemId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });
  }

  async list(query: ListReviewsQueryDto) {
    return this.prisma.review.findMany({
      where: query.productId
        ? {
            orderItem: {
              variant: {
                productId: query.productId,
              },
            },
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        orderItem: {
          select: {
            id: true,
            variantId: true,
            variant: {
              select: {
                id: true,
                productId: true,
                sku: true,
              },
            },
          },
        },
      },
      take: 100,
    });
  }
}
