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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const stripe_1 = __importDefault(require("stripe"));
const notifications_service_1 = require("../notifications/notifications.service");
const prisma_service_1 = require("../prisma/prisma.service");
let PaymentsService = class PaymentsService {
    prisma;
    config;
    notifications;
    stripe;
    constructor(prisma, config, notifications) {
        this.prisma = prisma;
        this.config = config;
        this.notifications = notifications;
        const key = this.config.get('STRIPE_SECRET_KEY') ?? '';
        this.stripe = new stripe_1.default(key, { apiVersion: '2023-10-16' });
    }
    async stripeCheckout(userId, payload) {
        const order = await this.getOrderForUser(userId, payload.orderId);
        if (order.currency !== 'USD') {
            throw new common_1.BadRequestException('Stripe checkout only supports USD');
        }
        if (order.status !== client_1.OrderStatus.PENDING_PAYMENT) {
            throw new common_1.BadRequestException('Order is not pending payment');
        }
        if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() <= Date.now()) {
            throw new common_1.BadRequestException('Payment window expired');
        }
        if (order.taxAmount !== 0 || order.discountAmount !== 0) {
            throw new common_1.BadRequestException('Stripe checkout currently supports taxAmount=0 and discountAmount=0 only');
        }
        const failedAttempt = await this.prisma.payment.findFirst({
            where: {
                orderId: order.id,
                status: client_1.PaymentStatus.FAILED
            },
            select: { id: true }
        });
        if (failedAttempt) {
            for (const item of order.items) {
                const availableQty = item.variant.stockQty - item.variant.reservedQty;
                if (availableQty < item.qty) {
                    throw new common_1.BadRequestException('Insufficient stock for payment retry');
                }
            }
        }
        const lineItems = order.items.map((item) => ({
            price_data: {
                currency: order.currency.toLowerCase(),
                product_data: {
                    name: item.variant.product.title
                },
                unit_amount: item.unitPrice
            },
            quantity: item.qty
        }));
        if (order.shippingFee > 0) {
            lineItems.push({
                price_data: {
                    currency: order.currency.toLowerCase(),
                    product_data: {
                        name: 'Shipping fee'
                    },
                    unit_amount: order.shippingFee
                },
                quantity: 1
            });
        }
        const lineItemsTotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
        const expectedTotal = lineItemsTotal + order.shippingFee + order.taxAmount - order.discountAmount;
        if (expectedTotal !== order.total) {
            throw new common_1.BadRequestException('Order total mismatch');
        }
        const successUrl = this.config.get('STRIPE_SUCCESS_URL') ?? 'http://localhost:3000';
        const cancelUrl = this.config.get('STRIPE_CANCEL_URL') ?? 'http://localhost:3000';
        const session = await this.stripe.checkout.sessions.create({
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancelUrl,
            line_items: lineItems,
            payment_intent_data: {
                metadata: {
                    orderId: order.id,
                    userId
                }
            },
            metadata: {
                orderId: order.id,
                userId
            }
        });
        const providerRef = session.payment_intent ?? session.id;
        const payment = await this.prisma.payment.create({
            data: {
                orderId: order.id,
                provider: client_1.PaymentProvider.STRIPE,
                providerRef,
                amount: order.total,
                currency: order.currency,
                status: client_1.PaymentStatus.REQUIRES_ACTION
            }
        });
        return { url: session.url, paymentId: payment.id };
    }
    async waveCheckout(userId, payload) {
        return this.mockMmkCheckout(userId, payload, client_1.PaymentProvider.WAVE_MONEY);
    }
    async kbzCheckout(userId, payload) {
        return this.mockMmkCheckout(userId, payload, client_1.PaymentProvider.KBZPAY);
    }
    async handleWaveMockWebhook(payload) {
        return this.handleMockWebhook(client_1.PaymentProvider.WAVE_MONEY, payload);
    }
    async handleKbzpayMockWebhook(payload) {
        return this.handleMockWebhook(client_1.PaymentProvider.KBZPAY, payload);
    }
    async handleStripeWebhook(req) {
        const signature = req.headers['stripe-signature'];
        if (!signature || Array.isArray(signature)) {
            throw new common_1.BadRequestException('Missing Stripe signature');
        }
        const webhookSecret = this.config.get('STRIPE_WEBHOOK_SECRET');
        if (!webhookSecret) {
            throw new common_1.BadRequestException('Stripe webhook secret not configured');
        }
        let event;
        try {
            const body = Buffer.isBuffer(req.body)
                ? req.body
                : typeof req.body === 'string'
                    ? req.body
                    : JSON.stringify(req.body ?? {});
            event = this.stripe.webhooks.constructEvent(body, signature, webhookSecret);
        }
        catch {
            throw new common_1.BadRequestException('Invalid Stripe signature');
        }
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            await this.handleStripeSessionCompleted(session);
        }
        if (event.type === 'payment_intent.payment_failed') {
            const intent = event.data.object;
            await this.handleStripePaymentFailed(intent);
        }
        if (event.type === 'charge.refunded') {
            const charge = event.data.object;
            await this.handleStripeRefunded(charge);
        }
        return { received: true };
    }
    async refundPayment(orderId) {
        const payment = await this.prisma.payment.findFirst({
            where: { orderId },
            orderBy: { createdAt: 'desc' },
            include: {
                order: {
                    select: {
                        id: true,
                        vendorId: true
                    }
                }
            }
        });
        if (!payment) {
            throw new common_1.NotFoundException('Payment not found');
        }
        if (payment.status === client_1.PaymentStatus.REFUNDED) {
            return {
                provider: payment.provider,
                refundRef: payment.providerRef,
                amount: payment.amount,
                duplicate: true
            };
        }
        let refundRef;
        if (payment.provider === client_1.PaymentProvider.STRIPE) {
            const ref = payment.providerRef;
            if (ref.startsWith('pi_')) {
                const refund = await this.stripe.refunds.create({ payment_intent: ref });
                refundRef = refund.id;
            }
            else if (ref.startsWith('ch_')) {
                const refund = await this.stripe.refunds.create({ charge: ref });
                refundRef = refund.id;
            }
            else if (ref.startsWith('cs_')) {
                const session = await this.stripe.checkout.sessions.retrieve(ref);
                const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : null;
                if (!paymentIntent) {
                    throw new common_1.BadRequestException('Stripe session missing payment intent');
                }
                const refund = await this.stripe.refunds.create({ payment_intent: paymentIntent });
                refundRef = refund.id;
            }
            else {
                throw new common_1.BadRequestException('Unsupported Stripe payment reference');
            }
        }
        else {
            refundRef = `mock:refund:${payment.provider}:${payment.orderId}:${Date.now()}`;
        }
        await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: client_1.PaymentStatus.REFUNDED }
        });
        await this.recordVendorLedgerDebit(payment.id, payment.orderId, payment.amount, payment.currency);
        return { provider: payment.provider, refundRef, amount: payment.amount };
    }
    async mockMmkCheckout(userId, payload, provider) {
        const order = await this.getOrderForUser(userId, payload.orderId);
        if (order.currency !== 'MMK') {
            throw new common_1.BadRequestException('MMK checkout only supports MMK currency');
        }
        if (order.status !== client_1.OrderStatus.PENDING_PAYMENT) {
            throw new common_1.BadRequestException('Order is not pending payment');
        }
        const existing = await this.prisma.payment.findFirst({
            where: {
                orderId: order.id,
                provider,
                status: client_1.PaymentStatus.SUCCEEDED
            },
            orderBy: { createdAt: 'desc' }
        });
        if (existing) {
            return { ok: true, paymentId: existing.id, duplicate: true };
        }
        const providerRef = `mock:${provider}:order:${order.id}:ts:${Date.now()}`;
        const payment = await this.prisma.payment.create({
            data: {
                orderId: order.id,
                provider,
                providerRef,
                amount: order.total,
                currency: order.currency,
                status: client_1.PaymentStatus.REQUIRES_ACTION
            }
        });
        const callbackResult = await this.applyMockPaymentSuccess(payment.id);
        return { ok: true, paymentId: payment.id, providerRef, ...callbackResult };
    }
    async handleMockWebhook(provider, payload) {
        const payment = await this.resolveMockPayment(provider, payload);
        const result = await this.applyMockPaymentSuccess(payment.id);
        return {
            received: true,
            paymentId: payment.id,
            ...result
        };
    }
    async resolveMockPayment(provider, payload) {
        if (!payload.orderId && !payload.paymentId && !payload.providerRef) {
            throw new common_1.BadRequestException('orderId, paymentId or providerRef is required');
        }
        const payment = await this.prisma.payment.findFirst({
            where: {
                provider,
                ...(payload.paymentId ? { id: payload.paymentId } : {}),
                ...(payload.orderId ? { orderId: payload.orderId } : {}),
                ...(payload.providerRef ? { providerRef: payload.providerRef } : {})
            },
            orderBy: { createdAt: 'desc' }
        });
        if (!payment) {
            throw new common_1.NotFoundException('Mock payment not found');
        }
        return payment;
    }
    async applyMockPaymentSuccess(paymentId) {
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                order: {
                    select: {
                        id: true,
                        status: true
                    }
                }
            }
        });
        if (!payment) {
            throw new common_1.NotFoundException('Payment not found');
        }
        if (payment.status === client_1.PaymentStatus.SUCCEEDED) {
            return { duplicate: true };
        }
        if (payment.order.status !== client_1.OrderStatus.PENDING_PAYMENT) {
            return { duplicate: true };
        }
        await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: client_1.PaymentStatus.SUCCEEDED }
        });
        await this.finalizePaidOrder(payment.orderId);
        await this.recordVendorLedgerCredit(payment.id, payment.orderId, payment.amount, payment.currency);
        await this.notifyOrderParticipants(payment.orderId, client_1.NotificationType.ORDER_STATUS_CHANGED, 'Payment succeeded', `Order ${payment.orderId} has been paid.`);
        return { duplicate: false };
    }
    async handleStripeSessionCompleted(session) {
        const providerRef = session.payment_intent ?? session.id;
        let payment = await this.prisma.payment.findFirst({
            where: { providerRef, provider: client_1.PaymentProvider.STRIPE }
        });
        if (!payment && session.metadata?.orderId) {
            payment = await this.prisma.payment.findFirst({
                where: { orderId: session.metadata.orderId, provider: client_1.PaymentProvider.STRIPE },
                orderBy: { createdAt: 'desc' }
            });
        }
        if (!payment)
            return;
        if (payment.status === client_1.PaymentStatus.SUCCEEDED) {
            return;
        }
        await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: client_1.PaymentStatus.SUCCEEDED, providerRef }
        });
        await this.finalizePaidOrder(payment.orderId);
        await this.recordVendorLedgerCredit(payment.id, payment.orderId, payment.amount, payment.currency);
        await this.notifyOrderParticipants(payment.orderId, client_1.NotificationType.ORDER_STATUS_CHANGED, 'Payment succeeded', `Order ${payment.orderId} has been paid.`);
    }
    async handleStripePaymentFailed(intent) {
        let payment = await this.prisma.payment.findFirst({
            where: { providerRef: intent.id, provider: client_1.PaymentProvider.STRIPE }
        });
        if (!payment && intent.metadata?.orderId) {
            payment = await this.prisma.payment.findFirst({
                where: { orderId: intent.metadata.orderId, provider: client_1.PaymentProvider.STRIPE },
                orderBy: { createdAt: 'desc' }
            });
        }
        if (!payment)
            return;
        await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: client_1.PaymentStatus.FAILED, providerRef: intent.id }
        });
        await this.releaseReservation(payment.orderId);
        await this.notifyOrderParticipants(payment.orderId, client_1.NotificationType.ORDER_STATUS_CHANGED, 'Payment failed', `Payment failed for order ${payment.orderId}. You can retry checkout.`, { notifyVendor: false });
    }
    async handleStripeRefunded(charge) {
        const intentId = charge.payment_intent;
        let payment = intentId
            ? await this.prisma.payment.findFirst({
                where: { providerRef: intentId, provider: client_1.PaymentProvider.STRIPE }
            })
            : null;
        if (!payment && intentId) {
            const intent = await this.stripe.paymentIntents.retrieve(intentId);
            const orderId = intent.metadata?.orderId;
            if (orderId) {
                payment = await this.prisma.payment.findFirst({
                    where: { orderId, provider: client_1.PaymentProvider.STRIPE },
                    orderBy: { createdAt: 'desc' }
                });
            }
        }
        if (!payment)
            return;
        if (payment.status === client_1.PaymentStatus.REFUNDED) {
            return;
        }
        await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: client_1.PaymentStatus.REFUNDED, providerRef: intentId ?? payment.providerRef }
        });
        await this.prisma.order.update({
            where: { id: payment.orderId },
            data: { status: client_1.OrderStatus.REFUNDED }
        });
        await this.recordVendorLedgerDebit(payment.id, payment.orderId, payment.amount, payment.currency);
        await this.notifyOrderParticipants(payment.orderId, client_1.NotificationType.ORDER_STATUS_CHANGED, 'Payment refunded', `Order ${payment.orderId} payment has been refunded.`);
    }
    async finalizePaidOrder(orderId) {
        await this.prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id: orderId },
                include: { items: true }
            });
            if (!order || order.status !== client_1.OrderStatus.PENDING_PAYMENT) {
                return;
            }
            await tx.order.update({
                where: { id: orderId },
                data: { status: client_1.OrderStatus.PAID }
            });
            for (const item of order.items) {
                const variant = await tx.productVariant.findUnique({
                    where: { id: item.variantId }
                });
                if (!variant)
                    continue;
                const reservedDecrement = Math.min(variant.reservedQty, item.qty);
                await tx.productVariant.update({
                    where: { id: item.variantId },
                    data: {
                        reservedQty: { decrement: reservedDecrement },
                        stockQty: { decrement: item.qty }
                    }
                });
            }
        });
    }
    async releaseReservation(orderId) {
        await this.prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id: orderId },
                include: { items: true }
            });
            if (!order || order.status !== client_1.OrderStatus.PENDING_PAYMENT) {
                return;
            }
            for (const item of order.items) {
                const variant = await tx.productVariant.findUnique({
                    where: { id: item.variantId }
                });
                if (!variant)
                    continue;
                const reservedDecrement = Math.min(variant.reservedQty, item.qty);
                if (reservedDecrement > 0) {
                    await tx.productVariant.update({
                        where: { id: item.variantId },
                        data: { reservedQty: { decrement: reservedDecrement } }
                    });
                }
            }
        });
    }
    async getOrderForUser(userId, orderId) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, userId },
            include: {
                items: {
                    include: {
                        variant: { include: { product: true } }
                    }
                }
            }
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    async notifyOrderParticipants(orderId, type, title, body, options) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                userId: true,
                status: true,
                vendor: {
                    select: {
                        ownerUserId: true
                    }
                }
            }
        });
        if (!order) {
            return;
        }
        const shouldNotifyCustomer = options?.notifyCustomer ?? true;
        const shouldNotifyVendor = options?.notifyVendor ?? true;
        const targets = [];
        if (shouldNotifyCustomer) {
            targets.push(order.userId);
        }
        if (shouldNotifyVendor) {
            targets.push(order.vendor.ownerUserId);
        }
        await Promise.all(Array.from(new Set(targets)).map((userId) => this.notifications.createAndPush({
            userId,
            type,
            title,
            body,
            payload: {
                orderId: order.id,
                status: order.status
            }
        })));
    }
    async recordVendorLedgerCredit(paymentId, orderId, amount, currency) {
        const existing = await this.prisma.vendorLedgerEntry.findFirst({
            where: {
                paymentId,
                type: client_1.VendorLedgerEntryType.CREDIT
            },
            select: { id: true }
        });
        if (existing) {
            return;
        }
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { vendorId: true }
        });
        if (!order) {
            return;
        }
        await this.prisma.vendorLedgerEntry.create({
            data: {
                vendorId: order.vendorId,
                orderId,
                paymentId,
                type: client_1.VendorLedgerEntryType.CREDIT,
                amount,
                currency,
                note: 'Order payment received'
            }
        });
    }
    async recordVendorLedgerDebit(paymentId, orderId, amount, currency) {
        const existing = await this.prisma.vendorLedgerEntry.findFirst({
            where: {
                paymentId,
                type: client_1.VendorLedgerEntryType.DEBIT
            },
            select: { id: true }
        });
        if (existing) {
            return;
        }
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { vendorId: true }
        });
        if (!order) {
            return;
        }
        await this.prisma.vendorLedgerEntry.create({
            data: {
                vendorId: order.vendorId,
                orderId,
                paymentId,
                type: client_1.VendorLedgerEntryType.DEBIT,
                amount,
                currency,
                note: 'Refund adjustment'
            }
        });
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        notifications_service_1.NotificationsService])
], PaymentsService);
