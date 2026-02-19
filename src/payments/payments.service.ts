import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  PaymentProvider,
  PaymentStatus,
  VendorLedgerEntryType,
  OrderStatus
} from '@prisma/client';
import Stripe from 'stripe';
import { RequestLike } from '../common/http.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPaymentWebhookDto } from './dto/mock-payment-webhook.dto';
import { StripeCheckoutDto } from './dto/stripe-checkout.dto';

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;
  private readonly stripeConfigured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService
  ) {
    const key = (this.config.get<string>('STRIPE_SECRET_KEY') ?? '').trim();
    this.stripeConfigured = key.length > 0;
    this.stripe = new Stripe(key, { apiVersion: '2023-10-16' });
  }

  async stripeCheckout(userId: string, payload: StripeCheckoutDto) {
    this.ensureStripeConfigured();
    const order = await this.getOrderForUser(userId, payload.orderId);

    if (order.currency !== 'USD') {
      throw new BadRequestException('Stripe checkout only supports USD');
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Order is not pending payment');
    }

    if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Payment window expired');
    }

    if (order.taxAmount !== 0 || order.discountAmount !== 0) {
      throw new BadRequestException(
        'Stripe checkout currently supports taxAmount=0 and discountAmount=0 only'
      );
    }

    const failedAttempt = await this.prisma.payment.findFirst({
      where: {
        orderId: order.id,
        status: PaymentStatus.FAILED
      },
      select: { id: true }
    });

    if (failedAttempt) {
      for (const item of order.items) {
        const availableQty = item.variant.stockQty - item.variant.reservedQty;
        if (availableQty < item.qty) {
          throw new BadRequestException('Insufficient stock for payment retry');
        }
      }
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.map((item) => ({
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
    const expectedTotal =
      lineItemsTotal + order.shippingFee + order.taxAmount - order.discountAmount;
    if (expectedTotal !== order.total) {
      throw new BadRequestException('Order total mismatch');
    }

    const successUrl = this.config.get<string>('STRIPE_SUCCESS_URL') ?? 'http://localhost:3000';
    const cancelUrl = this.config.get<string>('STRIPE_CANCEL_URL') ?? 'http://localhost:3000';

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

    const providerRef = (session.payment_intent as string | null) ?? session.id;

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.STRIPE,
        providerRef,
        amount: order.total,
        currency: order.currency,
        status: PaymentStatus.REQUIRES_ACTION
      }
    });

    return { url: session.url, paymentId: payment.id };
  }

  async waveCheckout(userId: string, payload: StripeCheckoutDto) {
    return this.mockMmkCheckout(userId, payload, PaymentProvider.WAVE_MONEY);
  }

  async kbzCheckout(userId: string, payload: StripeCheckoutDto) {
    return this.mockMmkCheckout(userId, payload, PaymentProvider.KBZPAY);
  }

  async handleWaveMockWebhook(payload: MockPaymentWebhookDto) {
    return this.handleMockWebhook(PaymentProvider.WAVE_MONEY, payload);
  }

  async handleKbzpayMockWebhook(payload: MockPaymentWebhookDto) {
    return this.handleMockWebhook(PaymentProvider.KBZPAY, payload);
  }

  async handleStripeWebhook(req: RequestLike) {
    this.ensureStripeConfigured();
    const signature = req.headers['stripe-signature'];
    if (!signature || Array.isArray(signature)) {
      throw new BadRequestException('Missing Stripe signature');
    }

    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new BadRequestException('Stripe webhook secret not configured');
    }

    let event: Stripe.Event;
    try {
      const body =
        Buffer.isBuffer(req.body)
          ? req.body
          : typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body ?? {});
      event = this.stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      await this.handleStripeSessionCompleted(session);
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      await this.handleStripePaymentFailed(intent);
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      await this.handleStripeRefunded(charge);
    }

    return { received: true };
  }

  async refundPayment(orderId: string) {
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
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      return {
        provider: payment.provider,
        refundRef: payment.providerRef,
        amount: payment.amount,
        duplicate: true
      };
    }

    let refundRef: string;

    if (payment.provider === PaymentProvider.STRIPE) {
      this.ensureStripeConfigured();
      const ref = payment.providerRef;
      if (ref.startsWith('pi_')) {
        const refund = await this.stripe.refunds.create({ payment_intent: ref });
        refundRef = refund.id;
      } else if (ref.startsWith('ch_')) {
        const refund = await this.stripe.refunds.create({ charge: ref });
        refundRef = refund.id;
      } else if (ref.startsWith('cs_')) {
        const session = await this.stripe.checkout.sessions.retrieve(ref);
        const paymentIntent =
          typeof session.payment_intent === 'string' ? session.payment_intent : null;
        if (!paymentIntent) {
          throw new BadRequestException('Stripe session missing payment intent');
        }
        const refund = await this.stripe.refunds.create({ payment_intent: paymentIntent });
        refundRef = refund.id;
      } else {
        throw new BadRequestException('Unsupported Stripe payment reference');
      }
    } else {
      refundRef = `mock:refund:${payment.provider}:${payment.orderId}:${Date.now()}`;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED }
    });

    await this.recordVendorLedgerDebit(payment.id, payment.orderId, payment.amount, payment.currency);

    return { provider: payment.provider, refundRef, amount: payment.amount };
  }

  private async mockMmkCheckout(
    userId: string,
    payload: StripeCheckoutDto,
    provider: PaymentProvider
  ) {
    const order = await this.getOrderForUser(userId, payload.orderId);

    if (order.currency !== 'MMK') {
      throw new BadRequestException('MMK checkout only supports MMK currency');
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Order is not pending payment');
    }

    const existing = await this.prisma.payment.findFirst({
      where: {
        orderId: order.id,
        provider,
        status: PaymentStatus.SUCCEEDED
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
        status: PaymentStatus.REQUIRES_ACTION
      }
    });

    const callbackResult = await this.applyMockPaymentSuccess(payment.id);
    return { ok: true, paymentId: payment.id, providerRef, ...callbackResult };
  }

  private async handleMockWebhook(provider: PaymentProvider, payload: MockPaymentWebhookDto) {
    const payment = await this.resolveMockPayment(provider, payload);
    const result = await this.applyMockPaymentSuccess(payment.id);
    return {
      received: true,
      paymentId: payment.id,
      ...result
    };
  }

  private async resolveMockPayment(provider: PaymentProvider, payload: MockPaymentWebhookDto) {
    if (!payload.orderId && !payload.paymentId && !payload.providerRef) {
      throw new BadRequestException('orderId, paymentId or providerRef is required');
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
      throw new NotFoundException('Mock payment not found');
    }

    return payment;
  }

  private async applyMockPaymentSuccess(paymentId: string) {
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
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentStatus.SUCCEEDED) {
      return { duplicate: true };
    }

    if (payment.order.status !== OrderStatus.PENDING_PAYMENT) {
      return { duplicate: true };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.SUCCEEDED }
    });

    await this.finalizePaidOrder(payment.orderId);
    await this.recordVendorLedgerCredit(payment.id, payment.orderId, payment.amount, payment.currency);
    await this.notifyOrderParticipants(
      payment.orderId,
      NotificationType.ORDER_STATUS_CHANGED,
      'Payment succeeded',
      `Order ${payment.orderId} has been paid.`
    );

    return { duplicate: false };
  }

  private async handleStripeSessionCompleted(session: Stripe.Checkout.Session) {
    const providerRef = (session.payment_intent as string | null) ?? session.id;

    let payment = await this.prisma.payment.findFirst({
      where: { providerRef, provider: PaymentProvider.STRIPE }
    });

    if (!payment && session.metadata?.orderId) {
      payment = await this.prisma.payment.findFirst({
        where: { orderId: session.metadata.orderId, provider: PaymentProvider.STRIPE },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (!payment) return;
    if (payment.status === PaymentStatus.SUCCEEDED) {
      return;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.SUCCEEDED, providerRef }
    });

    await this.finalizePaidOrder(payment.orderId);
    await this.recordVendorLedgerCredit(payment.id, payment.orderId, payment.amount, payment.currency);
    await this.notifyOrderParticipants(
      payment.orderId,
      NotificationType.ORDER_STATUS_CHANGED,
      'Payment succeeded',
      `Order ${payment.orderId} has been paid.`
    );
  }

  private async handleStripePaymentFailed(intent: Stripe.PaymentIntent) {
    let payment = await this.prisma.payment.findFirst({
      where: { providerRef: intent.id, provider: PaymentProvider.STRIPE }
    });

    if (!payment && intent.metadata?.orderId) {
      payment = await this.prisma.payment.findFirst({
        where: { orderId: intent.metadata.orderId, provider: PaymentProvider.STRIPE },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (!payment) return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED, providerRef: intent.id }
    });

    await this.releaseReservation(payment.orderId);
    await this.notifyOrderParticipants(
      payment.orderId,
      NotificationType.ORDER_STATUS_CHANGED,
      'Payment failed',
      `Payment failed for order ${payment.orderId}. You can retry checkout.`,
      { notifyVendor: false }
    );
  }

  private async handleStripeRefunded(charge: Stripe.Charge) {
    this.ensureStripeConfigured();
    const intentId = charge.payment_intent as string | null;

    let payment = intentId
      ? await this.prisma.payment.findFirst({
          where: { providerRef: intentId, provider: PaymentProvider.STRIPE }
        })
      : null;

    if (!payment && intentId) {
      const intent = await this.stripe.paymentIntents.retrieve(intentId);
      const orderId = intent.metadata?.orderId;
      if (orderId) {
        payment = await this.prisma.payment.findFirst({
          where: { orderId, provider: PaymentProvider.STRIPE },
          orderBy: { createdAt: 'desc' }
        });
      }
    }

    if (!payment) return;
    if (payment.status === PaymentStatus.REFUNDED) {
      return;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED, providerRef: intentId ?? payment.providerRef }
    });

    await this.prisma.order.update({
      where: { id: payment.orderId },
      data: { status: OrderStatus.REFUNDED }
    });
    await this.recordVendorLedgerDebit(payment.id, payment.orderId, payment.amount, payment.currency);
    await this.notifyOrderParticipants(
      payment.orderId,
      NotificationType.ORDER_STATUS_CHANGED,
      'Payment refunded',
      `Order ${payment.orderId} payment has been refunded.`
    );
  }

  private async finalizePaidOrder(orderId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true }
      });

      if (!order || order.status !== OrderStatus.PENDING_PAYMENT) {
        return;
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAID }
      });

      for (const item of order.items) {
        const variant = await tx.productVariant.findUnique({
          where: { id: item.variantId }
        });
        if (!variant) continue;
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

  private async releaseReservation(orderId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true }
      });

      if (!order || order.status !== OrderStatus.PENDING_PAYMENT) {
        return;
      }

      for (const item of order.items) {
        const variant = await tx.productVariant.findUnique({
          where: { id: item.variantId }
        });
        if (!variant) continue;
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

  private async getOrderForUser(userId: string, orderId: string) {
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
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private async notifyOrderParticipants(
    orderId: string,
    type: NotificationType,
    title: string,
    body: string,
    options?: { notifyCustomer?: boolean; notifyVendor?: boolean }
  ) {
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
    const targets: string[] = [];

    if (shouldNotifyCustomer) {
      targets.push(order.userId);
    }
    if (shouldNotifyVendor) {
      targets.push(order.vendor.ownerUserId);
    }

    await Promise.all(
      Array.from(new Set(targets)).map((userId) =>
        this.notifications.createAndPush({
          userId,
          type,
          title,
          body,
          payload: {
            orderId: order.id,
            status: order.status
          }
        })
      )
    );
  }

  private async recordVendorLedgerCredit(
    paymentId: string,
    orderId: string,
    amount: number,
    currency: string
  ) {
    const existing = await this.prisma.vendorLedgerEntry.findFirst({
      where: {
        paymentId,
        type: VendorLedgerEntryType.CREDIT
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
        type: VendorLedgerEntryType.CREDIT,
        amount,
        currency,
        note: 'Order payment received'
      }
    });
  }

  private async recordVendorLedgerDebit(
    paymentId: string,
    orderId: string,
    amount: number,
    currency: string
  ) {
    const existing = await this.prisma.vendorLedgerEntry.findFirst({
      where: {
        paymentId,
        type: VendorLedgerEntryType.DEBIT
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
        type: VendorLedgerEntryType.DEBIT,
        amount,
        currency,
        note: 'Refund adjustment'
      }
    });
  }

  private ensureStripeConfigured() {
    if (!this.stripeConfigured) {
      throw new BadRequestException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env or use MMK checkout.'
      );
    }
  }
}
