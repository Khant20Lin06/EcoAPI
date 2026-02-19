import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import { Queue } from 'bullmq';

interface EnqueueReservationExpiryInput {
  orderId: string;
  runAt: string;
}

interface EnqueueNotificationInput {
  notificationId: string;
  channels: NotificationChannel[];
}

interface EnqueuePayoutInput {
  periodStart?: string;
  periodEnd?: string;
}

@Injectable()
export class JobsService implements OnModuleInit {
  constructor(
    @InjectQueue('inventory-reservations')
    private readonly reservationsQueue: Queue,
    @InjectQueue('notifications')
    private readonly notificationsQueue: Queue,
    @InjectQueue('payouts')
    private readonly payoutsQueue: Queue,
    private readonly config: ConfigService
  ) {}

  async onModuleInit() {
    const cron = this.config.get<string>('PAYOUT_WEEKLY_CRON') ?? '10 0 * * 1';
    await this.payoutsQueue.add(
      'prepare-weekly',
      {},
      {
        jobId: 'payouts-prepare-weekly',
        repeat: { pattern: cron },
        removeOnComplete: 200,
        removeOnFail: 500
      }
    );
  }

  async enqueueReservationExpiry(payload: EnqueueReservationExpiryInput) {
    const runAt = new Date(payload.runAt);
    const delay = Math.max(runAt.getTime() - Date.now(), 0);
    await this.reservationsQueue.add(
      'expire',
      { orderId: payload.orderId },
      {
        delay,
        jobId: `reservation-expiry-${payload.orderId}`,
        removeOnComplete: 500,
        removeOnFail: 500
      }
    );
    return { ok: true };
  }

  async enqueueNotification(payload: EnqueueNotificationInput) {
    await Promise.all(
      payload.channels.map((channel) =>
        this.notificationsQueue.add(
          'deliver',
          {
            notificationId: payload.notificationId,
            channel
          },
          {
            jobId: `notification-${payload.notificationId}-${channel}`,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 30_000
            },
            removeOnComplete: 1000,
            removeOnFail: 1000
          }
        )
      )
    );

    return { ok: true, queued: payload.channels.length };
  }

  async enqueuePayout(payload: EnqueuePayoutInput = {}) {
    const job = await this.payoutsQueue.add(
      'prepare-weekly',
      {
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd
      },
      {
        jobId:
          payload.periodStart && payload.periodEnd
            ? `payout-${payload.periodStart}-${payload.periodEnd}`
            : `payout-manual-${Date.now()}`,
        removeOnComplete: 500,
        removeOnFail: 500
      }
    );
    return { ok: true, jobId: job.id };
  }
}
