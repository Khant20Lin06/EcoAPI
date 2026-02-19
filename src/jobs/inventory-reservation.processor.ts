import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

@Processor('inventory-reservations')
export class InventoryReservationProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ orderId: string }>) {
    if (job.name !== 'expire') {
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: job.data.orderId },
      include: { items: true }
    });

    if (!order || order.status !== OrderStatus.PENDING_PAYMENT) {
      return;
    }

    if (order.paymentExpiresAt && order.paymentExpiresAt > new Date()) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const variant = await tx.productVariant.findUnique({
          where: { id: item.variantId }
        });
        if (!variant) continue;
        const decrement = Math.min(variant.reservedQty, item.qty);
        if (decrement > 0) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { reservedQty: { decrement } }
          });
        }
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELED }
      });
    });
  }
}
