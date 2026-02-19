import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { VendorShippingController } from './vendor-shipping.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ShippingController, VendorShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
