import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AddressesModule } from './addresses/addresses.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { ChatModule } from './chat/chat.module';
import { BlogsModule } from './blogs/blogs.module';
import { ContactModule } from './contact/contact.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PromotionsModule } from './promotions/promotions.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeGatewayModule } from './realtime/realtime-gateway.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReturnsModule } from './returns/returns.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ShippingModule } from './shipping/shipping.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';
import { VendorsModule } from './vendors/vendors.module';
import { WishlistModule } from './wishlist/wishlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AddressesModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    VendorsModule,
    WishlistModule,
    CatalogModule,
    BlogsModule,
    ChatModule,
    ContactModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    ReturnsModule,
    ReviewsModule,
    PromotionsModule,
    ShippingModule,
    AdminModule,
    NotificationsModule,
    RealtimeModule,
    RealtimeGatewayModule,
    JobsModule,
    UploadsModule
  ]
})
export class AppModule {}
