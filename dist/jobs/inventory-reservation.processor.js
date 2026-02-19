"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryReservationProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let InventoryReservationProcessor = class InventoryReservationProcessor extends bullmq_1.WorkerHost {
    prisma;
    constructor(prisma) {
        super();
        this.prisma = prisma;
    }
    async process(job) {
        if (job.name !== 'expire') {
            return;
        }
        const order = await this.prisma.order.findUnique({
            where: { id: job.data.orderId },
            include: { items: true }
        });
        if (!order || order.status !== client_1.OrderStatus.PENDING_PAYMENT) {
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
                if (!variant)
                    continue;
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
                data: { status: client_1.OrderStatus.CANCELED }
            });
        });
    }
};
exports.InventoryReservationProcessor = InventoryReservationProcessor;
exports.InventoryReservationProcessor = InventoryReservationProcessor = __decorate([
    (0, bullmq_1.Processor)('inventory-reservations'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InventoryReservationProcessor);
