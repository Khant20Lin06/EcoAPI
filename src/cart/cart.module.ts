import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartDomainService } from './cart.domain.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CartController],
  providers: [CartDomainService, { provide: CartService, useExisting: CartDomainService }]
})
export class CartModule {}
