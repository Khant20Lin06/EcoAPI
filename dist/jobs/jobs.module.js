"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsModule = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../prisma/prisma.module");
const inventory_reservation_processor_1 = require("./inventory-reservation.processor");
const jobs_service_1 = require("./jobs.service");
const notifications_processor_1 = require("./notifications.processor");
const payouts_processor_1 = require("./payouts.processor");
let JobsModule = class JobsModule {
};
exports.JobsModule = JobsModule;
exports.JobsModule = JobsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            bullmq_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    connection: {
                        url: config.get('REDIS_URL')
                    }
                })
            }),
            bullmq_1.BullModule.registerQueue({ name: 'inventory-reservations' }),
            bullmq_1.BullModule.registerQueue({ name: 'notifications' }),
            bullmq_1.BullModule.registerQueue({ name: 'payouts' })
        ],
        providers: [
            jobs_service_1.JobsService,
            inventory_reservation_processor_1.InventoryReservationProcessor,
            notifications_processor_1.NotificationsProcessor,
            payouts_processor_1.PayoutsProcessor
        ],
        exports: [jobs_service_1.JobsService]
    })
], JobsModule);
