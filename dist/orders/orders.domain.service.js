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
exports.OrdersDomainService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const jobs_service_1 = require("../jobs/jobs.service");
const constants_1 = require("../common/constants");
const notifications_service_1 = require("../notifications/notifications.service");
let OrdersDomainService = class OrdersDomainService {
    prisma;
    jobs;
    notifications;
    constructor(prisma, jobs, notifications) {
        this.prisma = prisma;
        this.jobs = jobs;
        this.notifications = notifications;
    }
    async create(userId, payload) {
        const order = await this.prisma.$transaction(async (tx) => {
            const cart = await tx.cart.findFirst({
                where: { userId },
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
                throw new common_1.BadRequestException('Cart is empty');
            }
            if (!cart.vendor || cart.vendor.status !== client_1.VendorStatus.APPROVED) {
                throw new common_1.BadRequestException('Vendor is not approved');
            }
            for (const item of cart.items) {
                if (item.variant.product.status !== client_1.ProductStatus.ACTIVE) {
                    throw new common_1.BadRequestException('Product is not active');
                }
                const availableQty = item.variant.stockQty - item.variant.reservedQty;
                if (availableQty < item.qty) {
                    throw new common_1.BadRequestException('Insufficient stock');
                }
            }
            if (payload.fulfillment === client_1.FulfillmentType.SHIPPING) {
                if (!payload.shippingAddrId) {
                    throw new common_1.BadRequestException('Shipping address required');
                }
                const address = await tx.address.findFirst({
                    where: { id: payload.shippingAddrId, userId }
                });
                if (!address) {
                    throw new common_1.ForbiddenException('Shipping address not found');
                }
                const shippingRate = await tx.shippingRate.findFirst({
                    where: {
                        vendorId: cart.vendorId,
                        country: address.country.toUpperCase(),
                        active: true
                    }
                });
                if (!shippingRate) {
                    throw new common_1.BadRequestException('Shipping rate unavailable for this country');
                }
                if (shippingRate.currency.toUpperCase() !== cart.currency.toUpperCase()) {
                    throw new common_1.BadRequestException('Shipping rate currency mismatch');
                }
            }
            else if (payload.fulfillment === client_1.FulfillmentType.PICKUP) {
                if (!payload.pickupLocId) {
                    throw new common_1.BadRequestException('Pickup location required');
                }
                const pickup = await tx.pickupLocation.findFirst({
                    where: { id: payload.pickupLocId, vendorId: cart.vendorId }
                });
                if (!pickup) {
                    throw new common_1.BadRequestException('Pickup location not found');
                }
            }
            const subtotal = cart.items.reduce((sum, item) => {
                return sum + item.variant.price * item.qty;
            }, 0);
            let shippingFee = 0;
            if (payload.fulfillment === client_1.FulfillmentType.SHIPPING && payload.shippingAddrId) {
                const address = await tx.address.findFirst({
                    where: { id: payload.shippingAddrId, userId },
                    select: { country: true }
                });
                if (!address) {
                    throw new common_1.ForbiddenException('Shipping address not found');
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
                    throw new common_1.BadRequestException('Shipping rate unavailable for this country');
                }
                shippingFee = rate.flatRate;
            }
            const taxAmount = 0;
            const discountAmount = 0;
            const total = subtotal + shippingFee + taxAmount - discountAmount;
            const paymentExpiresAt = new Date(Date.now() + constants_1.STOCK_RESERVATION_MINUTES * 60 * 1000);
            const order = await tx.order.create({
                data: {
                    userId,
                    vendorId: cart.vendorId,
                    status: client_1.OrderStatus.PENDING_PAYMENT,
                    currency: cart.currency,
                    subtotal,
                    shippingFee,
                    taxAmount,
                    discountAmount,
                    total,
                    fulfillment: payload.fulfillment,
                    shippingAddrId: payload.fulfillment === client_1.FulfillmentType.SHIPPING ? payload.shippingAddrId : null,
                    pickupLocId: payload.fulfillment === client_1.FulfillmentType.PICKUP ? payload.pickupLocId : null,
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
        await this.jobs.enqueueReservationExpiry({
            orderId: order.id,
            runAt: order.paymentExpiresAt?.toISOString() ?? new Date().toISOString()
        });
        return order;
    }
    async list(userId, query) {
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
    async listVendor(userId, query) {
        const vendor = await this.prisma.vendor.findFirst({
            where: { ownerUserId: userId },
            select: { id: true }
        });
        if (!vendor) {
            throw new common_1.NotFoundException('Vendor not found');
        }
        const limit = query.limit ?? 20;
        const where = {
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
    async getVendor(userId, id) {
        const vendor = await this.prisma.vendor.findFirst({
            where: { ownerUserId: userId },
            select: { id: true }
        });
        if (!vendor) {
            throw new common_1.NotFoundException('Vendor not found');
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
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async listAdmin(query) {
        const limit = query.limit ?? 20;
        const where = {
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
    async getAdmin(id) {
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
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async get(userId, id) {
        const order = await this.prisma.order.findFirst({
            where: { id, userId },
            include: {
                items: { include: { variant: { include: { product: true } } } },
                vendor: true
            }
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async updateStatus(actorUserId, actorRole, id, payload) {
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
            throw new common_1.NotFoundException('Order not found');
        }
        if (payload.status === order.status) {
            return this.prisma.order.findUnique({ where: { id: order.id } });
        }
        if (actorRole === client_1.Role.CUSTOMER) {
            if (order.userId !== actorUserId) {
                throw new common_1.ForbiddenException('You cannot update this order');
            }
            if (payload.status !== client_1.OrderStatus.CANCELED) {
                throw new common_1.ForbiddenException('Customer can only cancel order');
            }
        }
        if (actorRole === client_1.Role.VENDOR) {
            const vendor = await this.prisma.vendor.findFirst({
                where: { id: order.vendorId, ownerUserId: actorUserId },
                select: { id: true }
            });
            if (!vendor) {
                throw new common_1.ForbiddenException('You cannot update this order');
            }
            if (payload.status === client_1.OrderStatus.CANCELED) {
                throw new common_1.ForbiddenException('Vendor cannot cancel order');
            }
        }
        const transitions = {
            [client_1.OrderStatus.PENDING_PAYMENT]: [client_1.OrderStatus.PAID, client_1.OrderStatus.CANCELED],
            [client_1.OrderStatus.PAID]: [client_1.OrderStatus.PROCESSING, client_1.OrderStatus.CANCELED],
            [client_1.OrderStatus.PROCESSING]: [client_1.OrderStatus.PACKED],
            [client_1.OrderStatus.PACKED]: [client_1.OrderStatus.SHIPPED, client_1.OrderStatus.READY_FOR_PICKUP],
            [client_1.OrderStatus.SHIPPED]: [client_1.OrderStatus.DELIVERED],
            [client_1.OrderStatus.READY_FOR_PICKUP]: [client_1.OrderStatus.PICKED_UP],
            [client_1.OrderStatus.DELIVERED]: [client_1.OrderStatus.RETURN_REQUESTED],
            [client_1.OrderStatus.PICKED_UP]: [client_1.OrderStatus.RETURN_REQUESTED],
            [client_1.OrderStatus.RETURN_REQUESTED]: [client_1.OrderStatus.RETURN_APPROVED],
            [client_1.OrderStatus.RETURN_APPROVED]: [client_1.OrderStatus.RETURNED],
            [client_1.OrderStatus.RETURNED]: [client_1.OrderStatus.REFUNDED],
            [client_1.OrderStatus.REFUNDED]: [],
            [client_1.OrderStatus.CANCELED]: []
        };
        const allowedNext = transitions[order.status] ?? [];
        if (!allowedNext.includes(payload.status)) {
            throw new common_1.BadRequestException(`Invalid transition from ${order.status} to ${payload.status}`);
        }
        const updatedOrder = await this.prisma.order.update({
            where: { id: order.id },
            data: { status: payload.status }
        });
        const vendorOwnerUserId = await this.getVendorOwnerUserId(order.vendorId);
        const recipients = [order.userId, vendorOwnerUserId].filter((userId) => userId !== actorUserId);
        await Promise.all(recipients.map((userId) => this.notifications.createAndPush({
            userId,
            type: client_1.NotificationType.ORDER_STATUS_CHANGED,
            title: 'Order status updated',
            body: `Order ${order.id} is now ${payload.status}`,
            payload: {
                orderId: order.id,
                status: payload.status
            }
        })));
        return updatedOrder;
    }
    async getVendorOwnerUserId(vendorId) {
        const vendor = await this.prisma.vendor.findUnique({
            where: { id: vendorId },
            select: { ownerUserId: true }
        });
        if (!vendor) {
            throw new common_1.NotFoundException('Vendor not found');
        }
        return vendor.ownerUserId;
    }
    encodeCursor(order) {
        const payload = {
            createdAt: order.createdAt.toISOString(),
            id: order.id
        };
        return Buffer.from(JSON.stringify(payload)).toString('base64');
    }
    decodeCursor(cursor) {
        try {
            const raw = Buffer.from(cursor, 'base64').toString('utf8');
            const parsed = JSON.parse(raw);
            if (!parsed.createdAt || !parsed.id) {
                throw new Error('Invalid order cursor');
            }
            return parsed;
        }
        catch {
            throw new common_1.BadRequestException('Invalid cursor');
        }
    }
};
exports.OrdersDomainService = OrdersDomainService;
exports.OrdersDomainService = OrdersDomainService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jobs_service_1.JobsService,
        notifications_service_1.NotificationsService])
], OrdersDomainService);
