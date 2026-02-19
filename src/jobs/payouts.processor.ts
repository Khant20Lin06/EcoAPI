import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  VendorLedgerEntryType,
  VendorPayoutBatchStatus,
  VendorPayoutItemStatus
} from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

interface PrepareWeeklyPayoutPayload {
  periodStart?: string;
  periodEnd?: string;
}

@Processor('payouts')
export class PayoutsProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<PrepareWeeklyPayoutPayload>) {
    if (job.name !== 'prepare-weekly') {
      return;
    }

    const period = this.resolvePeriod(job.data);

    const existingBatch = await this.prisma.vendorPayoutBatch.findFirst({
      where: {
        periodStart: period.start,
        periodEnd: period.end
      },
      select: { id: true }
    });
    if (existingBatch) {
      return { ok: true, duplicate: true, batchId: existingBatch.id };
    }

    const entries = await this.prisma.vendorLedgerEntry.findMany({
      where: {
        createdAt: {
          gte: period.start,
          lt: period.end
        }
      },
      select: {
        vendorId: true,
        currency: true,
        type: true,
        amount: true
      }
    });

    type Summary = { gross: number; refunds: number };
    const map = new Map<string, Summary>();
    for (const entry of entries) {
      const key = `${entry.vendorId}:${entry.currency}`;
      const current = map.get(key) ?? { gross: 0, refunds: 0 };

      if (entry.type === VendorLedgerEntryType.CREDIT) {
        current.gross += entry.amount;
      } else {
        current.refunds += entry.amount;
      }

      map.set(key, current);
    }

    const items = Array.from(map.entries()).map(([key, summary]) => {
      const split = key.split(':');
      const vendorId = split[0];
      const currency = split[1];
      if (!vendorId || !currency) {
        throw new Error(`Invalid payout key: ${key}`);
      }
      const net = summary.gross - summary.refunds;
      return {
        vendorId,
        currency,
        grossAmount: summary.gross,
        refundAdjustments: summary.refunds,
        netAmount: net,
        status: net > 0 ? VendorPayoutItemStatus.READY : VendorPayoutItemStatus.SKIPPED
      };
    });

    const batch = await this.prisma.vendorPayoutBatch.create({
      data: {
        periodStart: period.start,
        periodEnd: period.end,
        status: VendorPayoutBatchStatus.PREPARED
      }
    });

    if (items.length > 0) {
      await this.prisma.vendorPayoutItem.createMany({
        data: items.map((item) => ({
          batchId: batch.id,
          vendorId: item.vendorId,
          currency: item.currency,
          grossAmount: item.grossAmount,
          refundAdjustments: item.refundAdjustments,
          netAmount: item.netAmount,
          status: item.status
        }))
      });
    }

    return {
      ok: true,
      batchId: batch.id,
      items: items.length
    };
  }

  private resolvePeriod(payload: PrepareWeeklyPayoutPayload) {
    if (payload.periodStart && payload.periodEnd) {
      return {
        start: new Date(payload.periodStart),
        end: new Date(payload.periodEnd)
      };
    }

    const now = new Date();
    const dayIndex = (now.getUTCDay() + 6) % 7;
    const weekStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayIndex, 0, 0, 0, 0)
    );
    const previousWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    return {
      start: previousWeekStart,
      end: weekStart
    };
  }
}
