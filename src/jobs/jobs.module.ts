import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryReservationProcessor } from './inventory-reservation.processor';
import { JobsService } from './jobs.service';
import { NotificationsProcessor } from './notifications.processor';
import { PayoutsProcessor } from './payouts.processor';

@Module({
  imports: [
    PrismaModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL')
        }
      })
    }),
    BullModule.registerQueue({ name: 'inventory-reservations' }),
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'payouts' })
  ],
  providers: [
    JobsService,
    InventoryReservationProcessor,
    NotificationsProcessor,
    PayoutsProcessor
  ],
  exports: [JobsService]
})
export class JobsModule {}
