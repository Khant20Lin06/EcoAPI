import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType
} from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

interface NotificationJobPayload {
  notificationId: string;
  channel: NotificationChannel;
}

interface DeliveryResult {
  status: NotificationDeliveryStatus;
  provider: string;
  providerRef?: string;
  error?: string;
  retryable?: boolean;
}

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {
    super();
  }

  async process(job: Job<NotificationJobPayload>) {
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
        status: NotificationDeliveryStatus.PENDING
      },
      update: {
        status: NotificationDeliveryStatus.PENDING,
        provider: 'PENDING',
        error: null,
        providerRef: null
      }
    });

    const result =
      payload.channel === NotificationChannel.EMAIL
        ? await this.deliverEmail(notification.user.email, notification.title, notification.body)
        : await this.deliverSms(
            notification.user.phone,
            notification.user.locale,
            this.buildSmsText(notification.type, notification.body)
          );

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

    if (result.status === NotificationDeliveryStatus.FAILED && result.retryable) {
      const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
      const isFinal = job.attemptsMade + 1 >= attempts;
      if (isFinal) {
        // eslint-disable-next-line no-console
        console.error(
          `[notifications] Dead-letter: notification=${notification.id} channel=${payload.channel} error=${result.error}`
        );
      }
      throw new Error(result.error ?? 'Notification delivery failed');
    }

    if (result.status === NotificationDeliveryStatus.FAILED && !result.retryable) {
      // eslint-disable-next-line no-console
      console.error(
        `[notifications] Permanent failure: notification=${notification.id} channel=${payload.channel} error=${result.error}`
      );
    }
  }

  private buildSmsText(type: NotificationType, body: string) {
    if (type === NotificationType.NEW_MESSAGE) {
      return `Eco: ${body}`;
    }
    if (type === NotificationType.ORDER_STATUS_CHANGED) {
      return `Eco order update: ${body}`;
    }
    return `Eco return update: ${body}`;
  }

  private async deliverEmail(to: string, subject: string, body: string): Promise<DeliveryResult> {
    const apiKey = this.config.get<string>('SENDGRID_API_KEY');
    const from = this.config.get<string>('SENDGRID_FROM_EMAIL');
    if (!apiKey || !from) {
      return {
        status: NotificationDeliveryStatus.SKIPPED,
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
        status: NotificationDeliveryStatus.SENT,
        provider: 'SENDGRID',
        providerRef: response.headers.get('x-message-id') ?? undefined
      };
    }

    const message = await this.safeText(response);
    const retryable = response.status >= 500 || response.status === 429;
    return {
      status: NotificationDeliveryStatus.FAILED,
      provider: 'SENDGRID',
      error: message || `SendGrid error ${response.status}`,
      retryable
    };
  }

  private async deliverSms(
    phone: string | null,
    locale: string,
    body: string
  ): Promise<DeliveryResult> {
    if (!phone) {
      return {
        status: NotificationDeliveryStatus.SKIPPED,
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

  private async deliverTwilioSms(to: string, body: string): Promise<DeliveryResult> {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_FROM');
    if (!sid || !token || !from) {
      return {
        status: NotificationDeliveryStatus.SKIPPED,
        provider: 'TWILIO',
        error: 'TWILIO not configured'
      };
    }

    const encoded = new URLSearchParams();
    encoded.set('To', to);
    encoded.set('From', from);
    encoded.set('Body', body);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: encoded.toString()
      }
    );

    if (response.ok) {
      const data = (await response.json()) as { sid?: string };
      return {
        status: NotificationDeliveryStatus.SENT,
        provider: 'TWILIO',
        providerRef: data.sid
      };
    }

    const message = await this.safeText(response);
    const retryable = response.status >= 500 || response.status === 429;
    return {
      status: NotificationDeliveryStatus.FAILED,
      provider: 'TWILIO',
      error: message || `Twilio error ${response.status}`,
      retryable
    };
  }

  private async deliverMyanmarSms(to: string, body: string): Promise<DeliveryResult> {
    const url = this.config.get<string>('MM_SMS_GATEWAY_URL');
    const apiKey = this.config.get<string>('MM_SMS_GATEWAY_API_KEY');
    if (!url) {
      return {
        status: NotificationDeliveryStatus.SKIPPED,
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
      const data = (await response.json().catch(() => ({}))) as { id?: string };
      return {
        status: NotificationDeliveryStatus.SENT,
        provider: 'MM_GATEWAY',
        providerRef: data.id
      };
    }

    const message = await this.safeText(response);
    const retryable = response.status >= 500 || response.status === 429;
    return {
      status: NotificationDeliveryStatus.FAILED,
      provider: 'MM_GATEWAY',
      error: message || `Myanmar gateway error ${response.status}`,
      retryable
    };
  }

  private async safeText(response: Response) {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }
}
