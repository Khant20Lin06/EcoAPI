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
exports.NotificationsProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let NotificationsProcessor = class NotificationsProcessor extends bullmq_1.WorkerHost {
    prisma;
    config;
    constructor(prisma, config) {
        super();
        this.prisma = prisma;
        this.config = config;
    }
    async process(job) {
        if (job.name !== 'deliver') {
            return;
        }
        const payload = job.data;
        const notification = await this.prisma.notification.findUnique({
            where: { id: payload.notificationId },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        phone: true,
                        locale: true
                    }
                }
            }
        });
        if (!notification) {
            return;
        }
        await this.prisma.notificationDelivery.upsert({
            where: {
                notificationId_channel: {
                    notificationId: notification.id,
                    channel: payload.channel
                }
            },
            create: {
                notificationId: notification.id,
                channel: payload.channel,
                provider: 'PENDING',
                status: client_1.NotificationDeliveryStatus.PENDING
            },
            update: {
                status: client_1.NotificationDeliveryStatus.PENDING,
                provider: 'PENDING',
                error: null,
                providerRef: null
            }
        });
        const result = payload.channel === client_1.NotificationChannel.EMAIL
            ? await this.deliverEmail(notification.user.email, notification.title, notification.body)
            : await this.deliverSms(notification.user.phone, notification.user.locale, this.buildSmsText(notification.type, notification.body));
        await this.prisma.notificationDelivery.update({
            where: {
                notificationId_channel: {
                    notificationId: notification.id,
                    channel: payload.channel
                }
            },
            data: {
                provider: result.provider,
                status: result.status,
                providerRef: result.providerRef,
                error: result.error
            }
        });
        if (result.status === client_1.NotificationDeliveryStatus.FAILED && result.retryable) {
            const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
            const isFinal = job.attemptsMade + 1 >= attempts;
            if (isFinal) {
                // eslint-disable-next-line no-console
                console.error(`[notifications] Dead-letter: notification=${notification.id} channel=${payload.channel} error=${result.error}`);
            }
            throw new Error(result.error ?? 'Notification delivery failed');
        }
        if (result.status === client_1.NotificationDeliveryStatus.FAILED && !result.retryable) {
            // eslint-disable-next-line no-console
            console.error(`[notifications] Permanent failure: notification=${notification.id} channel=${payload.channel} error=${result.error}`);
        }
    }
    buildSmsText(type, body) {
        if (type === client_1.NotificationType.NEW_MESSAGE) {
            return `Eco: ${body}`;
        }
        if (type === client_1.NotificationType.ORDER_STATUS_CHANGED) {
            return `Eco order update: ${body}`;
        }
        return `Eco return update: ${body}`;
    }
    async deliverEmail(to, subject, body) {
        const apiKey = this.config.get('SENDGRID_API_KEY');
        const from = this.config.get('SENDGRID_FROM_EMAIL');
        if (!apiKey || !from) {
            return {
                status: client_1.NotificationDeliveryStatus.SKIPPED,
                provider: 'SENDGRID',
                error: 'SENDGRID not configured'
            };
        }
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                personalizations: [{ to: [{ email: to }], subject }],
                from: { email: from },
                content: [{ type: 'text/plain', value: body }]
            })
        });
        if (response.ok) {
            return {
                status: client_1.NotificationDeliveryStatus.SENT,
                provider: 'SENDGRID',
                providerRef: response.headers.get('x-message-id') ?? undefined
            };
        }
        const message = await this.safeText(response);
        const retryable = response.status >= 500 || response.status === 429;
        return {
            status: client_1.NotificationDeliveryStatus.FAILED,
            provider: 'SENDGRID',
            error: message || `SendGrid error ${response.status}`,
            retryable
        };
    }
    async deliverSms(phone, locale, body) {
        if (!phone) {
            return {
                status: client_1.NotificationDeliveryStatus.SKIPPED,
                provider: 'SMS',
                error: 'User phone missing'
            };
        }
        const isMyanmar = locale.toLowerCase().startsWith('my');
        if (isMyanmar) {
            return this.deliverMyanmarSms(phone, body);
        }
        return this.deliverTwilioSms(phone, body);
    }
    async deliverTwilioSms(to, body) {
        const sid = this.config.get('TWILIO_ACCOUNT_SID');
        const token = this.config.get('TWILIO_AUTH_TOKEN');
        const from = this.config.get('TWILIO_FROM');
        if (!sid || !token || !from) {
            return {
                status: client_1.NotificationDeliveryStatus.SKIPPED,
                provider: 'TWILIO',
                error: 'TWILIO not configured'
            };
        }
        const encoded = new URLSearchParams();
        encoded.set('To', to);
        encoded.set('From', from);
        encoded.set('Body', body);
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: encoded.toString()
        });
        if (response.ok) {
            const data = (await response.json());
            return {
                status: client_1.NotificationDeliveryStatus.SENT,
                provider: 'TWILIO',
                providerRef: data.sid
            };
        }
        const message = await this.safeText(response);
        const retryable = response.status >= 500 || response.status === 429;
        return {
            status: client_1.NotificationDeliveryStatus.FAILED,
            provider: 'TWILIO',
            error: message || `Twilio error ${response.status}`,
            retryable
        };
    }
    async deliverMyanmarSms(to, body) {
        const url = this.config.get('MM_SMS_GATEWAY_URL');
        const apiKey = this.config.get('MM_SMS_GATEWAY_API_KEY');
        if (!url) {
            return {
                status: client_1.NotificationDeliveryStatus.SKIPPED,
                provider: 'MM_GATEWAY',
                error: 'MM_SMS_GATEWAY_URL not configured'
            };
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify({
                to,
                message: body
            })
        });
        if (response.ok) {
            const data = (await response.json().catch(() => ({})));
            return {
                status: client_1.NotificationDeliveryStatus.SENT,
                provider: 'MM_GATEWAY',
                providerRef: data.id
            };
        }
        const message = await this.safeText(response);
        const retryable = response.status >= 500 || response.status === 429;
        return {
            status: client_1.NotificationDeliveryStatus.FAILED,
            provider: 'MM_GATEWAY',
            error: message || `Myanmar gateway error ${response.status}`,
            retryable
        };
    }
    async safeText(response) {
        try {
            return await response.text();
        }
        catch {
            return '';
        }
    }
};
exports.NotificationsProcessor = NotificationsProcessor;
exports.NotificationsProcessor = NotificationsProcessor = __decorate([
    (0, bullmq_1.Processor)('notifications'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], NotificationsProcessor);
