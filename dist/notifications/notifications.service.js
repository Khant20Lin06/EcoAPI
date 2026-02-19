"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const jobs_service_1 = require("../jobs/jobs.service");
const prisma_service_1 = require("../prisma/prisma.service");
const realtime_publisher_1 = require("../realtime/realtime.publisher");
let NotificationsService = class NotificationsService {
    prisma;
    realtimePublisher;
    jobs;
    constructor(prisma, realtimePublisher, jobs) {
        this.prisma = prisma;
        this.realtimePublisher = realtimePublisher;
        this.jobs = jobs;
    }
    async createAndPush(input) {
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
            channels: [client_1.NotificationChannel.EMAIL, client_1.NotificationChannel.SMS]
        });
        return notification;
    }
    async list(userId, query) {
        const limit = query.limit ?? 20;
        const where = {
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
        const nextCursor = hasNext && lastNotification
            ? this.encodeCursor(lastNotification)
            : null;
        return { items: pageItems, nextCursor };
    }
    async markRead(userId, notificationId) {
        const notification = await this.prisma.notification.findFirst({
            where: { id: notificationId, userId },
        });
        if (!notification) {
            throw new common_1.NotFoundException('Notification not found');
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
    async markAllRead(userId) {
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
    encodeCursor(notification) {
        const payload = {
            createdAt: notification.createdAt.toISOString(),
            id: notification.id,
        };
        return Buffer.from(JSON.stringify(payload)).toString('base64');
    }
    decodeCursor(cursor) {
        try {
            const raw = Buffer.from(cursor, 'base64').toString('utf8');
            const parsed = JSON.parse(raw);
            if (!parsed.createdAt || !parsed.id) {
                throw new Error('Invalid cursor payload');
            }
            return parsed;
        }
        catch {
            throw new common_1.BadRequestException('Invalid cursor');
        }
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        realtime_publisher_1.RealtimePublisher,
        jobs_service_1.JobsService])
], NotificationsService);
