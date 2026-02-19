import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfillmentType,
  NotificationType,
  OrderStatus,
  Prisma,
  ReturnRequestStatus,
} from '@prisma/client';
import { DEFAULT_RETURN_WINDOW_DAYS } from '../common/constants';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { ListAdminReturnsQueryDto } from './dto/list-admin-returns-query.dto';
import { ListVendorReturnsQueryDto } from './dto/list-vendor-returns-query.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';

interface ReturnCursorPayload {
  requestedAt: string;
  id: string;
}

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, payload: CreateReturnDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: payload.orderId, userId },
      include: { returns: true, vendor: { select: { ownerUserId: true } } },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      order.status !== OrderStatus.DELIVERED &&
      order.status !== OrderStatus.PICKED_UP
    ) {
      throw new BadRequestException('Order is not eligible for return');
    }

    const windowMs = DEFAULT_RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - order.updatedAt.getTime() > windowMs) {
      throw new BadRequestException('Return window expired');
    }

    const openStatuses = new Set<ReturnRequestStatus>([
      ReturnRequestStatus.REQUESTED,
      ReturnRequestStatus.APPROVED,
      ReturnRequestStatus.RECEIVED,
    ]);
    const hasOpenReturn = order.returns.some((ret) => openStatuses.has(ret.status));
    if (hasOpenReturn) {
      throw new ConflictException('Return already exists');
    }

    const created = await this.prisma.returnRequest.create({
      data: {
        orderId: order.id,
        reason: payload.reason,
        status: ReturnRequestStatus.REQUESTED,
      },
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.RETURN_REQUESTED },
    });

    await this.notifications.createAndPush({
      userId: order.vendor.ownerUserId,
      type: NotificationType.RETURN_STATUS_CHANGED,
      title: 'Return requested',
      body: `Customer requested a return for order ${order.id}`,
      payload: {
        orderId: order.id,
        returnId: created.id,
        status: ReturnRequestStatus.REQUESTED,
      },
    });

    return created;
  }

  async approve(userId: string, id: string, payload: UpdateReturnStatusDto) {
    const record = await this.getReturnWithOrder(id);
    await this.ensureVendorOwnership(userId, record.order.vendorId);

    if (record.status !== ReturnRequestStatus.REQUESTED) {
      throw new BadRequestException('Return is not in requested status');
    }

    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: ReturnRequestStatus.APPROVED,
        resolvedAt: new Date(),
        notes: payload.notes,
      },
    });

    await this.prisma.order.update({
      where: { id: record.orderId },
      data: { status: OrderStatus.RETURN_APPROVED },
    });

    await this.notifyCustomer(
      record.orderId,
      ReturnRequestStatus.APPROVED,
      `Vendor approved return for order ${record.orderId}`,
      updated.id,
    );

    return updated;
  }

  async reject(userId: string, id: string, payload: UpdateReturnStatusDto) {
    const record = await this.getReturnWithOrder(id);
    await this.ensureVendorOwnership(userId, record.order.vendorId);

    if (record.status !== ReturnRequestStatus.REQUESTED) {
      throw new BadRequestException('Return is not in requested status');
    }

    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: ReturnRequestStatus.REJECTED,
        resolvedAt: new Date(),
        notes: payload.notes,
      },
    });

    const nextStatus =
      record.order.fulfillment === FulfillmentType.SHIPPING
        ? OrderStatus.DELIVERED
        : OrderStatus.PICKED_UP;

    await this.prisma.order.update({
      where: { id: record.orderId },
      data: { status: nextStatus },
    });

    await this.notifyCustomer(
      record.orderId,
      ReturnRequestStatus.REJECTED,
      `Vendor rejected return for order ${record.orderId}`,
      updated.id,
    );

    return updated;
  }

  async receive(userId: string, id: string, payload: UpdateReturnStatusDto) {
    const record = await this.getReturnWithOrder(id);
    await this.ensureVendorOwnership(userId, record.order.vendorId);

    if (record.status !== ReturnRequestStatus.APPROVED) {
      throw new BadRequestException('Return is not in approved status');
    }

    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: ReturnRequestStatus.RECEIVED,
        notes: payload.notes,
      },
    });

    await this.prisma.order.update({
      where: { id: record.orderId },
      data: { status: OrderStatus.RETURNED },
    });

    await this.notifyCustomer(
      record.orderId,
      ReturnRequestStatus.RECEIVED,
      `Return received for order ${record.orderId}`,
      updated.id,
    );

    return updated;
  }

  async refund(actorUserId: string, id: string, payload: UpdateReturnStatusDto) {
    const record = await this.getReturnWithOrder(id);

    if (record.status !== ReturnRequestStatus.RECEIVED) {
      throw new BadRequestException('Return is not in received status');
    }

    const refund = await this.payments.refundPayment(record.orderId);

    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: ReturnRequestStatus.REFUNDED,
        resolvedAt: new Date(),
        refundAmount: refund.amount,
        refundProvider: refund.provider,
        refundRef: refund.refundRef,
        notes: payload.notes,
      },
    });

    await this.prisma.order.update({
      where: { id: record.orderId },
      data: { status: OrderStatus.REFUNDED },
    });

    const participants = await this.getOrderParticipants(record.orderId);
    const recipients = [participants.customerUserId, participants.vendorOwnerUserId].filter(
      (userId) => userId !== actorUserId,
    );

    await Promise.all(
      recipients.map((userId) =>
        this.notifications.createAndPush({
          userId,
          type: NotificationType.RETURN_STATUS_CHANGED,
          title: 'Return refunded',
          body: `Return refunded for order ${record.orderId}`,
          payload: {
            orderId: record.orderId,
            returnId: updated.id,
            status: ReturnRequestStatus.REFUNDED,
          },
        }),
      ),
    );

    return updated;
  }

  async list(userId: string) {
    const items = await this.prisma.returnRequest.findMany({
      where: { order: { userId } },
      orderBy: { requestedAt: 'desc' },
      include: {
        order: {
          select: { id: true, status: true, total: true, createdAt: true },
        },
      },
    });

    return { items };
  }

  async listVendor(userId: string, query: ListVendorReturnsQueryDto) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const limit = query.limit ?? 20;
    const where: Prisma.ReturnRequestWhereInput = {
      order: { vendorId: vendor.id },
      status: query.status,
    };

    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      where.OR = [
        { requestedAt: { lt: new Date(cursor.requestedAt) } },
        {
          requestedAt: new Date(cursor.requestedAt),
          id: { lt: cursor.id },
        },
      ];
    }

    const items = await this.prisma.returnRequest.findMany({
      where,
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        order: {
          select: {
            id: true,
            userId: true,
            status: true,
            fulfillment: true,
            total: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
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
      select: { id: true },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const record = await this.prisma.returnRequest.findFirst({
      where: {
        id,
        order: { vendorId: vendor.id },
      },
      include: {
        order: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
              },
            },
            items: {
              include: {
                variant: {
                  include: {
                    product: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Return not found');
    }
    return record;
  }

  async listAdmin(query: ListAdminReturnsQueryDto) {
    const limit = query.limit ?? 20;
    const where: Prisma.ReturnRequestWhereInput = {
      status: query.status,
      order: {
        vendorId: query.vendorId,
        userId: query.userId,
      },
    };

    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      where.OR = [
        { requestedAt: { lt: new Date(cursor.requestedAt) } },
        {
          requestedAt: new Date(cursor.requestedAt),
          id: { lt: cursor.id },
        },
      ];
    }

    const items = await this.prisma.returnRequest.findMany({
      where,
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        order: {
          select: {
            id: true,
            vendorId: true,
            userId: true,
            status: true,
            total: true,
            createdAt: true,
            vendor: {
              select: {
                id: true,
                name: true,
              },
            },
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    const hasNext = items.length > limit;
    const pageItems = hasNext ? items.slice(0, limit) : items;
    const lastItem = pageItems[pageItems.length - 1];
    const nextCursor = hasNext && lastItem ? this.encodeCursor(lastItem) : null;

    return { items: pageItems, nextCursor };
  }

  async getAdmin(id: string) {
    const record = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            vendor: true,
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
              },
            },
            items: {
              include: {
                variant: {
                  include: {
                    product: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Return not found');
    }
    return record;
  }

  private async getReturnWithOrder(id: string) {
    const record = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { order: true },
    });

    if (!record) {
      throw new NotFoundException('Return not found');
    }

    return record;
  }

  private async ensureVendorOwnership(userId: string, vendorId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, ownerUserId: userId },
    });
    if (!vendor) {
      throw new ForbiddenException('Vendor not authorized for this return');
    }
  }

  private async notifyCustomer(
    orderId: string,
    status: ReturnRequestStatus,
    message: string,
    returnId: string,
  ) {
    const participants = await this.getOrderParticipants(orderId);
    await this.notifications.createAndPush({
      userId: participants.customerUserId,
      type: NotificationType.RETURN_STATUS_CHANGED,
      title: 'Return status updated',
      body: message,
      payload: {
        orderId,
        returnId,
        status,
      },
    });
  }

  private async getOrderParticipants(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        vendor: {
          select: {
            ownerUserId: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      customerUserId: order.userId,
      vendorOwnerUserId: order.vendor.ownerUserId,
    };
  }

  private encodeCursor(input: { requestedAt: Date; id: string }) {
    const payload: ReturnCursorPayload = {
      requestedAt: input.requestedAt.toISOString(),
      id: input.id,
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private decodeCursor(cursor: string): ReturnCursorPayload {
    try {
      const raw = Buffer.from(cursor, 'base64').toString('utf8');
      const parsed = JSON.parse(raw) as ReturnCursorPayload;
      if (!parsed.requestedAt || !parsed.id) {
        throw new Error('Invalid return cursor');
      }
      return parsed;
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }
}
