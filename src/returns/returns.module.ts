import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReturnsController } from './returns.controller';
import { AdminReturnsController, VendorReturnsController } from './returns-ops.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [PrismaModule, PaymentsModule, NotificationsModule],
  controllers: [ReturnsController, VendorReturnsController, AdminReturnsController],
  providers: [ReturnsService]
})
export class ReturnsModule {}
