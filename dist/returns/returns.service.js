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
exports.ReturnsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const constants_1 = require("../common/constants");
const notifications_service_1 = require("../notifications/notifications.service");
const payments_service_1 = require("../payments/payments.service");
const prisma_service_1 = require("../prisma/prisma.service");
let ReturnsService = class ReturnsService {
    prisma;
    payments;
    notifications;
    constructor(prisma, payments, notifications) {
        this.prisma = prisma;
        this.payments = payments;
        this.notifications = notifications;
    }
    async create(userId, payload) {
        const order = await this.prisma.order.findFirst({
            where: { id: payload.orderId, userId },
            include: { returns: true, vendor: { select: { ownerUserId: true } } },
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        if (order.status !== client_1.OrderStatus.DELIVERED &&
            order.status !== client_1.OrderStatus.PICKED_UP) {
            throw new common_1.BadRequestException('Order is not eligible for return');
        }
        const windowMs = constants_1.DEFAULT_RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        if (Date.now() - order.updatedAt.getTime() > windowMs) {
            throw new common_1.BadRequestException('Return window expired');
        }
        const openStatuses = new Set([
            client_1.ReturnRequestStatus.REQUESTED,
            client_1.ReturnRequestStatus.APPROVED,
            client_1.ReturnRequestStatus.RECEIVED,
        ]);
        const hasOpenReturn = order.returns.some((ret) => openStatuses.has(ret.status));
        if (hasOpenReturn) {
            throw new common_1.ConflictException('Return already exists');
        }
        const created = await this.prisma.returnRequest.create({
            data: {
                orderId: order.id,
                reason: payload.reason,
                status: client_1.ReturnRequestStatus.REQUESTED,
            },
        });
        await this.prisma.order.update({
            where: { id: order.id },
            data: { status: client_1.OrderStatus.RETURN_REQUESTED },
        });
        await this.notifications.createAndPush({
            userId: order.vendor.ownerUserId,
            type: client_1.NotificationType.RETURN_STATUS_CHANGED,
            title: 'Return requested',
            body: `Customer requested a return for order ${order.id}`,
            payload: {
                orderId: order.id,
                returnId: created.id,
                status: client_1.ReturnRequestStatus.REQUESTED,
            },
        });
        return created;
    }
    async approve(userId, id, payload) {
        const record = await this.getReturnWithOrder(id);
        await this.ensureVendorOwnership(userId, record.order.vendorId);
        if (record.status !== client_1.ReturnRequestStatus.REQUESTED) {
            throw new common_1.BadRequestException('Return is not in requested status');
        }
        const updated = await this.prisma.returnRequest.update({
            where: { id },
            data: {
                status: client_1.ReturnRequestStatus.APPROVED,
                resolvedAt: new Date(),
                notes: payload.notes,
            },
        });
        await this.prisma.order.update({
            where: { id: record.orderId },
            data: { status: client_1.OrderStatus.RETURN_APPROVED },
        });
        await this.notifyCustomer(record.orderId, client_1.ReturnRequestStatus.APPROVED, `Vendor approved return for order ${record.orderId}`, updated.id);
        return updated;
    }
    async reject(userId, id, payload) {
        const record = await this.getReturnWithOrder(id);
        await this.ensureVendorOwnership(userId, record.order.vendorId);
        if (record.status !== client_1.ReturnRequestStatus.REQUESTED) {
            throw new common_1.BadRequestException('Return is not in requested status');
        }
        const updated = await this.prisma.returnRequest.update({
            where: { id },
            data: {
                status: client_1.ReturnRequestStatus.REJECTED,
                resolvedAt: new Date(),
                notes: payload.notes,
            },
        });
        const nextStatus = record.order.fulfillment === client_1.FulfillmentType.SHIPPING
            ? client_1.OrderStatus.DELIVERED
            : client_1.OrderStatus.PICKED_UP;
        await this.prisma.order.update({
            where: { id: record.orderId },
            data: { status: nextStatus },
        });
        await this.notifyCustomer(record.orderId, client_1.ReturnRequestStatus.REJECTED, `Vendor rejected return for order ${record.orderId}`, updated.id);
        return updated;
    }
    async receive(userId, id, payload) {
        const record = await this.getReturnWithOrder(id);
        await this.ensureVendorOwnership(userId, record.order.vendorId);
        if (record.status !== client_1.ReturnRequestStatus.APPROVED) {
            throw new common_1.BadRequestException('Return is not in approved status');
        }
        const updated = await this.prisma.returnRequest.update({
            where: { id },
            data: {
                status: client_1.ReturnRequestStatus.RECEIVED,
                notes: payload.notes,
            },
        });
        await this.prisma.order.update({
            where: { id: record.orderId },
            data: { status: client_1.OrderStatus.RETURNED },
        });
        await this.notifyCustomer(record.orderId, client_1.ReturnRequestStatus.RECEIVED, `Return received for order ${record.orderId}`, updated.id);
        return updated;
    }
    async refund(actorUserId, id, payload) {
        const record = await this.getReturnWithOrder(id);
        if (record.status !== client_1.ReturnRequestStatus.RECEIVED) {
            throw new common_1.BadRequestException('Return is not in received status');
        }
        const refund = await this.payments.refundPayment(record.orderId);
        const updated = await this.prisma.returnRequest.update({
            where: { id },
            data: {
                status: client_1.ReturnRequestStatus.REFUNDED,
                resolvedAt: new Date(),
                refundAmount: refund.amount,
                refundProvider: refund.provider,
                refundRef: refund.refundRef,
                notes: payload.notes,
            },
        });
        await this.prisma.order.update({
            where: { id: record.orderId },
            data: { status: client_1.OrderStatus.REFUNDED },
        });
        const participants = await this.getOrderParticipants(record.orderId);
        const recipients = [participants.customerUserId, participants.vendorOwnerUserId].filter((userId) => userId !== actorUserId);
        await Promise.all(recipients.map((userId) => this.notifications.createAndPush({
            userId,
            type: client_1.NotificationType.RETURN_STATUS_CHANGED,
            title: 'Return refunded',
            body: `Return refunded for order ${record.orderId}`,
            payload: {
                orderId: record.orderId,
                returnId: updated.id,
                status: client_1.ReturnRequestStatus.REFUNDED,
            },
        })));
        return updated;
    }
    async list(userId) {
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
    async listVendor(userId, query) {
        const vendor = await this.prisma.vendor.findFirst({
            where: { ownerUserId: userId },
            select: { id: true },
        });
        if (!vendor) {
            throw new common_1.NotFoundException('Vendor not found');
        }
        const limit = query.limit ?? 20;
        const where = {
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
    async getVendor(userId, id) {
        const vendor = await this.prisma.vendor.findFirst({
            where: { ownerUserId: userId },
            select: { id: true },
        });
        if (!vendor) {
            throw new common_1.NotFoundException('Vendor not found');
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
            throw new common_1.NotFoundException('Return not found');
        }
        return record;
    }
    async listAdmin(query) {
        const limit = query.limit ?? 20;
        const where = {
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
    async getAdmin(id) {
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
            throw new common_1.NotFoundException('Return not found');
        }
        return record;
    }
    async getReturnWithOrder(id) {
        const record = await this.prisma.returnRequest.findUnique({
            where: { id },
            include: { order: true },
        });
        if (!record) {
            throw new common_1.NotFoundException('Return not found');
        }
        return record;
    }
    async ensureVendorOwnership(userId, vendorId) {
        const vendor = await this.prisma.vendor.findFirst({
            where: { id: vendorId, ownerUserId: userId },
        });
        if (!vendor) {
            throw new common_1.ForbiddenException('Vendor not authorized for this return');
        }
    }
    async notifyCustomer(orderId, status, message, returnId) {
        const participants = await this.getOrderParticipants(orderId);
        await this.notifications.createAndPush({
            userId: participants.customerUserId,
            type: client_1.NotificationType.RETURN_STATUS_CHANGED,
            title: 'Return status updated',
            body: message,
            payload: {
                orderId,
                returnId,
                status,
            },
        });
    }
    async getOrderParticipants(orderId) {
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
            throw new common_1.NotFoundException('Order not found');
        }
        return {
            customerUserId: order.userId,
            vendorOwnerUserId: order.vendor.ownerUserId,
        };
    }
    encodeCursor(input) {
        const payload = {
            requestedAt: input.requestedAt.toISOString(),
            id: input.id,
        };
        return Buffer.from(JSON.stringify(payload)).toString('base64');
    }
    decodeCursor(cursor) {
        try {
            const raw = Buffer.from(cursor, 'base64').toString('utf8');
            const parsed = JSON.parse(raw);
            if (!parsed.requestedAt || !parsed.id) {
                throw new Error('Invalid return cursor');
            }
            return parsed;
        }
        catch {
            throw new common_1.BadRequestException('Invalid cursor');
        }
    }
};
exports.ReturnsService = ReturnsService;
exports.ReturnsService = ReturnsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        payments_service_1.PaymentsService,
        notifications_service_1.NotificationsService])
], ReturnsService);
