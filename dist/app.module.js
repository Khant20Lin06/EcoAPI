"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const addresses_module_1 = require("./addresses/addresses.module");
const admin_module_1 = require("./admin/admin.module");
const auth_module_1 = require("./auth/auth.module");
const cart_module_1 = require("./cart/cart.module");
const catalog_module_1 = require("./catalog/catalog.module");
const chat_module_1 = require("./chat/chat.module");
const jobs_module_1 = require("./jobs/jobs.module");
const notifications_module_1 = require("./notifications/notifications.module");
const orders_module_1 = require("./orders/orders.module");
const payments_module_1 = require("./payments/payments.module");
const promotions_module_1 = require("./promotions/promotions.module");
const prisma_module_1 = require("./prisma/prisma.module");
const realtime_gateway_module_1 = require("./realtime/realtime-gateway.module");
const realtime_module_1 = require("./realtime/realtime.module");
const returns_module_1 = require("./returns/returns.module");
const reviews_module_1 = require("./reviews/reviews.module");
const shipping_module_1 = require("./shipping/shipping.module");
const uploads_module_1 = require("./uploads/uploads.module");
const users_module_1 = require("./users/users.module");
const vendors_module_1 = require("./vendors/vendors.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            addresses_module_1.AddressesModule,
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            vendors_module_1.VendorsModule,
            catalog_module_1.CatalogModule,
            chat_module_1.ChatModule,
            cart_module_1.CartModule,
            orders_module_1.OrdersModule,
            payments_module_1.PaymentsModule,
            returns_module_1.ReturnsModule,
            reviews_module_1.ReviewsModule,
            promotions_module_1.PromotionsModule,
            shipping_module_1.ShippingModule,
            admin_module_1.AdminModule,
            notifications_module_1.NotificationsModule,
            realtime_module_1.RealtimeModule,
            realtime_gateway_module_1.RealtimeGatewayModule,
            jobs_module_1.JobsModule,
            uploads_module_1.UploadsModule
        ]
    })
], AppModule);
