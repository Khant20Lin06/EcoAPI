import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { ListChatMessagesQueryDto } from './dto/list-chat-messages-query.dto';
import { ListChatThreadsQueryDto } from './dto/list-chat-threads-query.dto';

interface CursorPayload {
  createdAt: string;
  id: string;
}

interface SendMessageInput {
  body: string;
  clientMessageId?: string;
}

interface OrderParticipantContext {
  orderId: string;
  vendorId: string;
  customerUserId: string;
  vendorOwnerUserId: string;
  participantUserIds: string[];
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimePublisher: RealtimePublisher,
  ) {}

  async assertOrderAccess(userId: string, orderId: string) {
    await this.getOrderParticipantContext(orderId, userId);
  }

  async listThreads(userId: string, query: ListChatThreadsQueryDto) {
    const limit = query.limit ?? 20;
    const whereAnd: Prisma.ChatThreadWhereInput[] = [
      {
        OR: [{ customerUserId: userId }, { vendor: { ownerUserId: userId } }],
      },
    ];

    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      whereAnd.push({
        OR: [
          { updatedAt: { lt: new Date(cursor.createdAt) } },
          {
            updatedAt: new Date(cursor.createdAt),
            id: { lt: cursor.id },
          },
        ],
      });
    }

    const items = await this.prisma.chatThread.findMany({
      where: { AND: whereAnd },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        order: {
          select: {
            id: true,
            status: true,
            total: true,
            currency: true,
            fulfillment: true,
            createdAt: true,
          },
        },
        vendor: {
          select: {
            id: true,
            name: true,
            ownerUserId: true,
          },
        },
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
            senderUserId: true,
            body: true,
            createdAt: true,
          },
        },
        readStates: {
          where: { userId },
          select: {
            lastReadMessageId: true,
            lastReadAt: true,
          },
          take: 1,
        },
      },
    });

    const hasNext = items.length > limit;
    const pageItems = hasNext ? items.slice(0, limit) : items;
    const lastThread = pageItems[pageItems.length - 1];
    const nextCursor =
      hasNext && lastThread
        ? this.encodeCursor({
            id: lastThread.id,
            createdAt: lastThread.updatedAt,
          })
        : null;

    return {
      items: pageItems.map((thread) => {
        const lastMessage = thread.messages[0] ?? null;
        const readState = thread.readStates[0] ?? null;
        const unread =
          !!lastMessage &&
          lastMessage.senderUserId !== userId &&
          (!readState?.lastReadAt || lastMessage.createdAt > readState.lastReadAt);

        return {
          id: thread.id,
          orderId: thread.orderId,
          customerUserId: thread.customerUserId,
          vendorId: thread.vendorId,
          updatedAt: thread.updatedAt,
          order: thread.order,
          vendor: thread.vendor,
          lastMessage,
          unread,
          readState,
        };
      }),
      nextCursor,
    };
  }

  async getUnreadCount(userId: string) {
    const threads = await this.prisma.chatThread.findMany({
      where: {
        OR: [{ customerUserId: userId }, { vendor: { ownerUserId: userId } }],
      },
      include: {
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            senderUserId: true,
            createdAt: true,
          },
        },
        readStates: {
          where: { userId },
          select: {
            lastReadAt: true,
          },
          take: 1,
        },
      },
    });

    let count = 0;
    for (const thread of threads) {
      const lastMessage = thread.messages[0];
      if (!lastMessage || lastMessage.senderUserId === userId) {
        continue;
      }

      const lastReadAt = thread.readStates[0]?.lastReadAt;
      if (!lastReadAt || lastMessage.createdAt > lastReadAt) {
        count += 1;
      }
    }

    return { count };
  }

  async listMessages(
    userId: string,
    orderId: string,
    query: ListChatMessagesQueryDto,
  ) {
    await this.getOrderParticipantContext(orderId, userId);

    const thread = await this.prisma.chatThread.findUnique({
      where: { orderId },
      select: { id: true },
    });

    if (!thread) {
      return { items: [], nextCursor: null };
    }

    const limit = query.limit ?? 20;
    const whereAnd: Prisma.ChatMessageWhereInput[] = [{ threadId: thread.id }];

    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      whereAnd.push({
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          {
            createdAt: new Date(cursor.createdAt),
            id: { lt: cursor.id },
          },
        ],
      });
    }

    const items = await this.prisma.chatMessage.findMany({
      where: { AND: whereAnd },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    const hasNext = items.length > limit;
    const pageItems = hasNext ? items.slice(0, limit) : items;
    const lastMessage = pageItems[pageItems.length - 1];
    const nextCursor =
      hasNext && lastMessage
        ? this.encodeCursor({
            id: lastMessage.id,
            createdAt: lastMessage.createdAt,
          })
        : null;

    return { items: pageItems, nextCursor };
  }

  async sendMessage(userId: string, orderId: string, input: SendMessageInput) {
    const body = input.body.trim();
    if (!body) {
      throw new BadRequestException('Message body is required');
    }
    if (body.length > 2000) {
      throw new BadRequestException('Message body exceeds 2000 characters');
    }

    const context = await this.getOrderParticipantContext(orderId, userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const thread = await tx.chatThread.upsert({
        where: { orderId },
        update: {
          updatedAt: new Date(),
        },
        create: {
          orderId,
          customerUserId: context.customerUserId,
          vendorId: context.vendorId,
        },
      });

      const message = await tx.chatMessage.create({
        data: {
          threadId: thread.id,
          senderUserId: userId,
          body,
        },
      });

      await tx.chatReadState.upsert({
        where: {
          threadId_userId: {
            threadId: thread.id,
            userId,
          },
        },
        create: {
          threadId: thread.id,
          userId,
          lastReadMessageId: message.id,
          lastReadAt: message.createdAt,
        },
        update: {
          lastReadMessageId: message.id,
          lastReadAt: message.createdAt,
        },
      });

      await tx.chatThread.update({
        where: { id: thread.id },
        data: { updatedAt: message.createdAt },
      });

      return { thread, message };
    });

    const recipientUserId =
      userId === context.customerUserId
        ? context.vendorOwnerUserId
        : context.customerUserId;

    await this.notificationsService.createAndPush({
      userId: recipientUserId,
      type: NotificationType.NEW_MESSAGE,
      title: 'New message',
      body: `You received a new message for order ${orderId}`,
      payload: {
        orderId,
        threadId: result.thread.id,
        messageId: result.message.id,
        senderUserId: userId,
      },
    });

    const messagePayload = {
      orderId,
      message: {
        id: result.message.id,
        threadId: result.message.threadId,
        senderUserId: result.message.senderUserId,
        body: result.message.body,
        createdAt: result.message.createdAt,
      },
      clientMessageId: input.clientMessageId ?? null,
    };

    this.realtimePublisher.emitToUsers(
      context.participantUserIds,
      'chat:message',
      messagePayload,
    );
    this.realtimePublisher.emitToOrder(orderId, 'chat:message', messagePayload);

    return messagePayload;
  }

  async markRead(userId: string, orderId: string, messageId?: string) {
    const context = await this.getOrderParticipantContext(orderId, userId);
    const thread = await this.prisma.chatThread.findUnique({
      where: { orderId },
      select: { id: true },
    });

    if (!thread) {
      return { orderId, lastReadMessageId: null, lastReadAt: null };
    }

    const target = messageId
      ? await this.prisma.chatMessage.findFirst({
          where: {
            id: messageId,
            threadId: thread.id,
          },
          select: { id: true, createdAt: true },
        })
      : await this.prisma.chatMessage.findFirst({
          where: { threadId: thread.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, createdAt: true },
        });

    if (!target) {
      throw new NotFoundException('Message not found');
    }

    await this.prisma.chatReadState.upsert({
      where: {
        threadId_userId: {
          threadId: thread.id,
          userId,
        },
      },
      create: {
        threadId: thread.id,
        userId,
        lastReadMessageId: target.id,
        lastReadAt: target.createdAt,
      },
      update: {
        lastReadMessageId: target.id,
        lastReadAt: target.createdAt,
      },
    });

    const payload = {
      orderId,
      userId,
      lastReadMessageId: target.id,
      lastReadAt: target.createdAt,
    };

    this.realtimePublisher.emitToUsers(
      context.participantUserIds,
      'chat:read',
      payload,
    );
    this.realtimePublisher.emitToOrder(orderId, 'chat:read', payload);

    return payload;
  }

  private async getOrderParticipantContext(
    orderId: string,
    actorUserId?: string,
  ): Promise<OrderParticipantContext> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        vendorId: true,
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

    if (
      actorUserId &&
      actorUserId !== order.userId &&
      actorUserId !== order.vendor.ownerUserId
    ) {
      throw new ForbiddenException('You cannot access this chat thread');
    }

    return {
      orderId: order.id,
      vendorId: order.vendorId,
      customerUserId: order.userId,
      vendorOwnerUserId: order.vendor.ownerUserId,
      participantUserIds: [order.userId, order.vendor.ownerUserId],
    };
  }

  private encodeCursor(cursor: { createdAt: Date; id: string }) {
    const payload: CursorPayload = {
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private decodeCursor(cursor: string): CursorPayload {
    try {
      const raw = Buffer.from(cursor, 'base64').toString('utf8');
      const parsed = JSON.parse(raw) as CursorPayload;
      if (!parsed.createdAt || !parsed.id) {
        throw new Error('Invalid cursor payload');
      }
      return parsed;
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }
}
