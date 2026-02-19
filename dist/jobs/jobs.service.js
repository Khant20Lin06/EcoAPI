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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsService = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_2 = require("bullmq");
let JobsService = class JobsService {
    reservationsQueue;
    notificationsQueue;
    payoutsQueue;
    config;
    constructor(reservationsQueue, notificationsQueue, payoutsQueue, config) {
        this.reservationsQueue = reservationsQueue;
        this.notificationsQueue = notificationsQueue;
        this.payoutsQueue = payoutsQueue;
        this.config = config;
    }
    async onModuleInit() {
        const cron = this.config.get('PAYOUT_WEEKLY_CRON') ?? '10 0 * * 1';
        await this.payoutsQueue.add('prepare-weekly', {}, {
            jobId: 'payouts:prepare-weekly',
            repeat: { pattern: cron },
            removeOnComplete: 200,
            removeOnFail: 500
        });
    }
    async enqueueReservationExpiry(payload) {
        const runAt = new Date(payload.runAt);
        const delay = Math.max(runAt.getTime() - Date.now(), 0);
        await this.reservationsQueue.add('expire', { orderId: payload.orderId }, {
            delay,
            jobId: `reservation-expiry:${payload.orderId}`,
            removeOnComplete: 500,
            removeOnFail: 500
        });
        return { ok: true };
    }
    async enqueueNotification(payload) {
        await Promise.all(payload.channels.map((channel) => this.notificationsQueue.add('deliver', {
            notificationId: payload.notificationId,
            channel
        }, {
            jobId: `notification:${payload.notificationId}:${channel}`,
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 30_000
            },
            removeOnComplete: 1000,
            removeOnFail: 1000
        })));
        return { ok: true, queued: payload.channels.length };
    }
    async enqueuePayout(payload = {}) {
        const job = await this.payoutsQueue.add('prepare-weekly', {
            periodStart: payload.periodStart,
            periodEnd: payload.periodEnd
        }, {
            jobId: payload.periodStart && payload.periodEnd
                ? `payout:${payload.periodStart}:${payload.periodEnd}`
                : `payout:manual:${Date.now()}`,
            removeOnComplete: 500,
            removeOnFail: 500
        });
        return { ok: true, jobId: job.id };
    }
};
exports.JobsService = JobsService;
exports.JobsService = JobsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)('inventory-reservations')),
    __param(1, (0, bullmq_1.InjectQueue)('notifications')),
    __param(2, (0, bullmq_1.InjectQueue)('payouts')),
    __metadata("design:paramtypes", [bullmq_2.Queue,
        bullmq_2.Queue,
        bullmq_2.Queue,
        config_1.ConfigService])
], JobsService);
