import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

interface NotificationCursorPayload {
  createdAt: string;
  id: string;
}

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimePublisher,
    private readonly jobs: JobsService
  ) {}

  async createAndPush(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload,
      },
    });

    this.realtimePublisher.emitToUser(input.userId, 'notifications:new', {
      notification,
    });
    await this.jobs.enqueueNotification({
      notificationId: notification.id,
      channels: [NotificationChannel.EMAIL, NotificationChannel.SMS]
    });

    return notification;
  }

  async list(userId: string, query: ListNotificationsQueryDto) {
    const limit = query.limit ?? 20;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      where.OR = [
        { createdAt: { lt: new Date(cursor.createdAt) } },
        {
          createdAt: new Date(cursor.createdAt),
          id: { lt: cursor.id },
        },
      ];
    }

    const items = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasNext = items.length > limit;
    const pageItems = hasNext ? items.slice(0, limit) : items;
    const lastNotification = pageItems[pageItems.length - 1];
    const nextCursor =
      hasNext && lastNotification
        ? this.encodeCursor(lastNotification)
        : null;

    return { items: pageItems, nextCursor };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        readAt: null
      }
    });

    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const readAt = notification.readAt ?? new Date();
    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt },
    });

    this.realtimePublisher.emitToUser(userId, 'notifications:read', {
      notificationId: updated.id,
      readAt: updated.readAt,
    });

    return updated;
  }

  async markAllRead(userId: string) {
    const readAt = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt },
    });

    this.realtimePublisher.emitToUser(userId, 'notifications:read-all', {
      readAt,
    });

    return { ok: true, count: result.count, readAt };
  }

  private encodeCursor(notification: { createdAt: Date; id: string }) {
    const payload: NotificationCursorPayload = {
      createdAt: notification.createdAt.toISOString(),
      id: notification.id,
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private decodeCursor(cursor: string): NotificationCursorPayload {
    try {
      const raw = Buffer.from(cursor, 'base64').toString('utf8');
      const parsed = JSON.parse(raw) as NotificationCursorPayload;
      if (!parsed.createdAt || !parsed.id) {
        throw new Error('Invalid cursor payload');
      }
      return parsed;
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }
}
