import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  FulfillmentType,
  NotificationType,
  OrderStatus,
  Prisma,
  ProductStatus,
  Role,
  VendorStatus
} from '@prisma/client';
import { JobsService } from '../jobs/jobs.service';
import { STOCK_RESERVATION_MINUTES } from '../common/constants';
import { NotificationsService } from '../notifications/notifications.service';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { ListVendorOrdersQueryDto } from './dto/list-vendor-orders-query.dto';

interface OrderCursorPayload {
  createdAt: string;
  id: string;
}

@Injectable()
export class OrdersDomainService {
  private readonly logger = new Logger(OrdersDomainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService
  ) {}

  async create(userId: string, payload: CreateOrderDto) {
    const order = await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findFirst({
        where: {
          userId,
          items: {
            some: {}
          }
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          vendor: true,
          items: {
            include: {
              variant: {
                include: { product: true }
              }
            }
          }
        }
      });

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      if (!cart.vendor || cart.vendor.status !== VendorStatus.APPROVED) {
        throw new BadRequestException('Vendor is not approved');
      }

      for (const item of cart.items) {
        if (item.variant.product.status !== ProductStatus.ACTIVE) {
          throw new BadRequestException('Product is not active');
        }

        const availableQty = item.variant.stockQty - item.variant.reservedQty;
        if (availableQty < item.qty) {
          throw new BadRequestException('Insufficient stock');
        }
      }

      if (payload.fulfillment === FulfillmentType.SHIPPING) {
        if (!payload.shippingAddrId) {
          throw new BadRequestException('Shipping address required');
        }
        const address = await tx.address.findFirst({
          where: { id: payload.shippingAddrId, userId }
        });
        if (!address) {
          throw new ForbiddenException('Shipping address not found');
        }

        const shippingRate = await tx.shippingRate.findFirst({
          where: {
            vendorId: cart.vendorId,
            country: address.country.toUpperCase(),
            active: true
          }
        });
        if (!shippingRate) {
          throw new BadRequestException('Shipping rate unavailable for this country');
        }
        if (shippingRate.currency.toUpperCase() !== cart.currency.toUpperCase()) {
          throw new BadRequestException('Shipping rate currency mismatch');
        }
      } else if (payload.fulfillment === FulfillmentType.PICKUP) {
        if (!payload.pickupLocId) {
          throw new BadRequestException('Pickup location required');
        }
        const pickup = await tx.pickupLocation.findFirst({
          where: { id: payload.pickupLocId, vendorId: cart.vendorId }
        });
        if (!pickup) {
          throw new BadRequestException('Pickup location not found');
        }
      }

      const subtotal = cart.items.reduce((sum, item) => {
        return sum + item.variant.price * item.qty;
      }, 0);

      let shippingFee = 0;
      if (payload.fulfillment === FulfillmentType.SHIPPING && payload.shippingAddrId) {
        const address = await tx.address.findFirst({
          where: { id: payload.shippingAddrId, userId },
          select: { country: true }
        });
        if (!address) {
          throw new ForbiddenException('Shipping address not found');
        }
        const rate = await tx.shippingRate.findFirst({
          where: {
            vendorId: cart.vendorId,
            country: address.country.toUpperCase(),
            active: true
          },
          select: { flatRate: true }
        });
        if (!rate) {
          throw new BadRequestException('Shipping rate unavailable for this country');
        }
        shippingFee = rate.flatRate;
      }
      const taxAmount = 0;
      const discountAmount = 0;
      const total = subtotal + shippingFee + taxAmount - discountAmount;

      const paymentExpiresAt = new Date(
        Date.now() + STOCK_RESERVATION_MINUTES * 60 * 1000
      );

      const order = await tx.order.create({
        data: {
          userId,
          vendorId: cart.vendorId,
          status: OrderStatus.PENDING_PAYMENT,
          currency: cart.currency,
          subtotal,
          shippingFee,
          taxAmount,
          discountAmount,
          total,
          fulfillment: payload.fulfillment,
          shippingAddrId: payload.fulfillment === FulfillmentType.SHIPPING ? payload.shippingAddrId : null,
          pickupLocId: payload.fulfillment === FulfillmentType.PICKUP ? payload.pickupLocId : null,
          paymentExpiresAt,
          items: {
            create: cart.items.map((item) => ({
              variantId: item.variantId,
              qty: item.qty,
              unitPrice: item.variant.price,
              lineTotal: item.variant.price * item.qty
            }))
          }
        },
        include: {
          items: true
        }
      });

      for (const item of cart.items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { reservedQty: { increment: item.qty } }
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.delete({ where: { id: cart.id } });

      return order;
    });

    try {
      await this.jobs.enqueueReservationExpiry({
        orderId: order.id,
        runAt: order.paymentExpiresAt?.toISOString() ?? new Date().toISOString()
      });
    } catch (error) {
      // Queue outage should not fail checkout after order is successfully created.
      this.logger.warn(
        `Failed to enqueue reservation expiry for order ${order.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return order;
  }

  async list(userId: string, query: ListOrdersQueryDto) {
    const items = await this.prisma.order.findMany({
      where: {
        userId,
        status: query.status
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: { variant: { include: { product: true } } }
        },
        vendor: true
      }
    });

    return { items };
  }

  async listVendor(userId: string, query: ListVendorOrdersQueryDto) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { ownerUserId: userId },
      select: { id: true }
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const limit = query.limit ?? 20;
    const where: Prisma.OrderWhereInput = {
      vendorId: vendor.id,
      status: query.status
    };

    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      where.OR = [
        { createdAt: { lt: new Date(cursor.createdAt) } },
        {
          createdAt: new Date(cursor.createdAt),
          id: { lt: cursor.id }
        }
      ];
    }

    const items = await this.prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true
          }
        },
        items: {
          include: {
            variant: {
              include: {
                product: true
              }
            }
          }
        }
      }
    });

    const hasNext = items.length > limit;
    const pageItems = hasNext ? items.slice(0, limit) : items;
    const lastItem = pageItems[pageItems.length - 1];
    const nextCursor = hasNext && lastItem ? this.encodeCursor(lastItem) : null;

    return { items: pageItems, nextCursor };
  }

  async getVendor(userId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { ownerUserId: userId },
      select: { id: true }
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id,
        vendorId: vendor.id
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true
          }
        },
        items: {
          include: {
            variant: {
              include: {
                product: true
              }
            }
          }
        },
        payments: true,
        returns: true,
        shippingAddr: true,
        pickupLocation: true
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async listAdmin(query: ListAdminOrdersQueryDto) {
    const limit = query.limit ?? 20;
    const where: Prisma.OrderWhereInput = {
      status: query.status,
      vendorId: query.vendorId,
      userId: query.userId
    };

    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      where.OR = [
        { createdAt: { lt: new Date(cursor.createdAt) } },
        {
          createdAt: new Date(cursor.createdAt),
          id: { lt: cursor.id }
        }
      ];
    }

    const items = await this.prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        vendor: {
          select: {
            id: true,
            name: true
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            phone: true
          }
        },
        items: {
          include: {
            variant: {
              include: {
                product: true
              }
            }
          }
        }
      }
    });

    const hasNext = items.length > limit;
    const pageItems = hasNext ? items.slice(0, limit) : items;
    const lastItem = pageItems[pageItems.length - 1];
    const nextCursor = hasNext && lastItem ? this.encodeCursor(lastItem) : null;

    return { items: pageItems, nextCursor };
  }

  async getAdmin(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        vendor: true,
        user: {
          select: {
            id: true,
            email: true,
            phone: true
          }
        },
        items: {
          include: {
            variant: {
              include: {
                product: true
              }
            }
          }
        },
        payments: true,
        returns: true,
        shippingAddr: true,
        pickupLocation: true
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async get(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: {
        items: { include: { variant: { include: { product: true } } } },
        vendor: true
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateStatus(
    actorUserId: string,
    actorRole: Role,
    id: string,
    payload: UpdateOrderStatusDto
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        vendorId: true,
        status: true
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (payload.status === order.status) {
      return this.prisma.order.findUnique({ where: { id: order.id } });
    }

    if (actorRole === Role.CUSTOMER) {
      if (order.userId !== actorUserId) {
        throw new ForbiddenException('You cannot update this order');
      }
      if (payload.status !== OrderStatus.CANCELED) {
        throw new ForbiddenException('Customer can only cancel order');
      }
    }

    if (actorRole === Role.VENDOR) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: order.vendorId, ownerUserId: actorUserId },
        select: { id: true }
      });
      if (!vendor) {
        throw new ForbiddenException('You cannot update this order');
      }
      if (payload.status === OrderStatus.CANCELED) {
        throw new ForbiddenException('Vendor cannot cancel order');
      }
    }

    const transitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELED],
      [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.CANCELED],
      [OrderStatus.PROCESSING]: [OrderStatus.PACKED],
      [OrderStatus.PACKED]: [OrderStatus.SHIPPED, OrderStatus.READY_FOR_PICKUP],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
      [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.PICKED_UP],
      [OrderStatus.DELIVERED]: [OrderStatus.RETURN_REQUESTED],
      [OrderStatus.PICKED_UP]: [OrderStatus.RETURN_REQUESTED],
      [OrderStatus.RETURN_REQUESTED]: [OrderStatus.RETURN_APPROVED],
      [OrderStatus.RETURN_APPROVED]: [OrderStatus.RETURNED],
      [OrderStatus.RETURNED]: [OrderStatus.REFUNDED],
      [OrderStatus.REFUNDED]: [],
      [OrderStatus.CANCELED]: []
    };

    const allowedNext = transitions[order.status] ?? [];
    if (!allowedNext.includes(payload.status)) {
      throw new BadRequestException(
        `Invalid transition from ${order.status} to ${payload.status}`
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: { status: payload.status }
    });

    const vendorOwnerUserId = await this.getVendorOwnerUserId(order.vendorId);
    const recipients = [order.userId, vendorOwnerUserId].filter(
      (userId) => userId !== actorUserId
    );

    await Promise.all(
      recipients.map((userId) =>
        this.notifications.createAndPush({
          userId,
          type: NotificationType.ORDER_STATUS_CHANGED,
          title: 'Order status updated',
          body: `Order ${order.id} is now ${payload.status}`,
          payload: {
            orderId: order.id,
            status: payload.status
          }
        })
      )
    );

    return updatedOrder;
  }

  private async getVendorOwnerUserId(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { ownerUserId: true }
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    return vendor.ownerUserId;
  }

  private encodeCursor(order: { createdAt: Date; id: string }) {
    const payload: OrderCursorPayload = {
      createdAt: order.createdAt.toISOString(),
      id: order.id
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private decodeCursor(cursor: string): OrderCursorPayload {
    try {
      const raw = Buffer.from(cursor, 'base64').toString('utf8');
      const parsed = JSON.parse(raw) as OrderCursorPayload;
      if (!parsed.createdAt || !parsed.id) {
        throw new Error('Invalid order cursor');
      }
      return parsed;
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }
}
