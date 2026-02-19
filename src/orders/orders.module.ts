import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersController } from './orders.controller';
import { OrdersDomainService } from './orders.domain.service';
import { OrdersService } from './orders.service';
import { VendorOrdersController } from './vendor-orders.controller';

@Module({
  imports: [PrismaModule, JobsModule, NotificationsModule],
  controllers: [OrdersController, VendorOrdersController, AdminOrdersController],
  providers: [OrdersDomainService, { provide: OrdersService, useExisting: OrdersDomainService }]
})
export class OrdersModule {}
