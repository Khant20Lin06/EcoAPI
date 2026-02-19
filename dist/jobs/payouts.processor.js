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
exports.PayoutsProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let PayoutsProcessor = class PayoutsProcessor extends bullmq_1.WorkerHost {
    prisma;
    constructor(prisma) {
        super();
        this.prisma = prisma;
    }
    async process(job) {
        if (job.name !== 'prepare-weekly') {
            return;
        }
        const period = this.resolvePeriod(job.data);
        const existingBatch = await this.prisma.vendorPayoutBatch.findFirst({
            where: {
                periodStart: period.start,
                periodEnd: period.end
            },
            select: { id: true }
        });
        if (existingBatch) {
            return { ok: true, duplicate: true, batchId: existingBatch.id };
        }
        const entries = await this.prisma.vendorLedgerEntry.findMany({
            where: {
                createdAt: {
                    gte: period.start,
                    lt: period.end
                }
            },
            select: {
                vendorId: true,
                currency: true,
                type: true,
                amount: true
            }
        });
        const map = new Map();
        for (const entry of entries) {
            const key = `${entry.vendorId}:${entry.currency}`;
            const current = map.get(key) ?? { gross: 0, refunds: 0 };
            if (entry.type === client_1.VendorLedgerEntryType.CREDIT) {
                current.gross += entry.amount;
            }
            else {
                current.refunds += entry.amount;
            }
            map.set(key, current);
        }
        const items = Array.from(map.entries()).map(([key, summary]) => {
            const split = key.split(':');
            const vendorId = split[0];
            const currency = split[1];
            if (!vendorId || !currency) {
                throw new Error(`Invalid payout key: ${key}`);
            }
            const net = summary.gross - summary.refunds;
            return {
                vendorId,
                currency,
                grossAmount: summary.gross,
                refundAdjustments: summary.refunds,
                netAmount: net,
                status: net > 0 ? client_1.VendorPayoutItemStatus.READY : client_1.VendorPayoutItemStatus.SKIPPED
            };
        });
        const batch = await this.prisma.vendorPayoutBatch.create({
            data: {
                periodStart: period.start,
                periodEnd: period.end,
                status: client_1.VendorPayoutBatchStatus.PREPARED
            }
        });
        if (items.length > 0) {
            await this.prisma.vendorPayoutItem.createMany({
                data: items.map((item) => ({
                    batchId: batch.id,
                    vendorId: item.vendorId,
                    currency: item.currency,
                    grossAmount: item.grossAmount,
                    refundAdjustments: item.refundAdjustments,
                    netAmount: item.netAmount,
                    status: item.status
                }))
            });
        }
        return {
            ok: true,
            batchId: batch.id,
            items: items.length
        };
    }
    resolvePeriod(payload) {
        if (payload.periodStart && payload.periodEnd) {
            return {
                start: new Date(payload.periodStart),
                end: new Date(payload.periodEnd)
            };
        }
        const now = new Date();
        const dayIndex = (now.getUTCDay() + 6) % 7;
        const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayIndex, 0, 0, 0, 0));
        const previousWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        return {
            start: previousWeekStart,
            end: weekStart
        };
    }
};
exports.PayoutsProcessor = PayoutsProcessor;
exports.PayoutsProcessor = PayoutsProcessor = __decorate([
    (0, bullmq_1.Processor)('payouts'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PayoutsProcessor);
