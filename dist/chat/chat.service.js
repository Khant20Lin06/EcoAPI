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
exports.ChatService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const notifications_service_1 = require("../notifications/notifications.service");
const prisma_service_1 = require("../prisma/prisma.service");
const realtime_publisher_1 = require("../realtime/realtime.publisher");
let ChatService = class ChatService {
    prisma;
    notificationsService;
    realtimePublisher;
    constructor(prisma, notificationsService, realtimePublisher) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
        this.realtimePublisher = realtimePublisher;
    }
    async assertOrderAccess(userId, orderId) {
        await this.getOrderParticipantContext(orderId, userId);
    }
    async listThreads(userId, query) {
        const limit = query.limit ?? 20;
        const whereAnd = [
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
        const nextCursor = hasNext && lastThread
            ? this.encodeCursor({
                id: lastThread.id,
                createdAt: lastThread.updatedAt,
            })
            : null;
        return {
            items: pageItems.map((thread) => {
                const lastMessage = thread.messages[0] ?? null;
                const readState = thread.readStates[0] ?? null;
                const unread = !!lastMessage &&
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
    async listMessages(userId, orderId, query) {
        await this.getOrderParticipantContext(orderId, userId);
        const thread = await this.prisma.chatThread.findUnique({
            where: { orderId },
            select: { id: true },
        });
        if (!thread) {
            return { items: [], nextCursor: null };
        }
        const limit = query.limit ?? 20;
        const whereAnd = [{ threadId: thread.id }];
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
        const nextCursor = hasNext && lastMessage
            ? this.encodeCursor({
                id: lastMessage.id,
                createdAt: lastMessage.createdAt,
            })
            : null;
        return { items: pageItems, nextCursor };
    }
    async sendMessage(userId, orderId, input) {
        const body = input.body.trim();
        if (!body) {
            throw new common_1.BadRequestException('Message body is required');
        }
        if (body.length > 2000) {
            throw new common_1.BadRequestException('Message body exceeds 2000 characters');
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
        const recipientUserId = userId === context.customerUserId
            ? context.vendorOwnerUserId
            : context.customerUserId;
        await this.notificationsService.createAndPush({
            userId: recipientUserId,
            type: client_1.NotificationType.NEW_MESSAGE,
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
        this.realtimePublisher.emitToUsers(context.participantUserIds, 'chat:message', messagePayload);
        this.realtimePublisher.emitToOrder(orderId, 'chat:message', messagePayload);
        return messagePayload;
    }
    async markRead(userId, orderId, messageId) {
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
            throw new common_1.NotFoundException('Message not found');
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
        this.realtimePublisher.emitToUsers(context.participantUserIds, 'chat:read', payload);
        this.realtimePublisher.emitToOrder(orderId, 'chat:read', payload);
        return payload;
    }
    async getOrderParticipantContext(orderId, actorUserId) {
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
            throw new common_1.NotFoundException('Order not found');
        }
        if (actorUserId &&
            actorUserId !== order.userId &&
            actorUserId !== order.vendor.ownerUserId) {
            throw new common_1.ForbiddenException('You cannot access this chat thread');
        }
        return {
            orderId: order.id,
            vendorId: order.vendorId,
            customerUserId: order.userId,
            vendorOwnerUserId: order.vendor.ownerUserId,
            participantUserIds: [order.userId, order.vendor.ownerUserId],
        };
    }
    encodeCursor(cursor) {
        const payload = {
            createdAt: cursor.createdAt.toISOString(),
            id: cursor.id,
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
exports.ChatService = ChatService;
exports.ChatService = ChatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService,
        realtime_publisher_1.RealtimePublisher])
], ChatService);
