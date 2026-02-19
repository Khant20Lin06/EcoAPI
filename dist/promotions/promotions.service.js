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
exports.PromotionsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const create_promotion_dto_1 = require("./dto/create-promotion.dto");
let PromotionsService = class PromotionsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, role, dto) {
        const startsAt = new Date(dto.startsAt);
        const endsAt = new Date(dto.endsAt);
        if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
            throw new common_1.BadRequestException('Invalid startsAt or endsAt');
        }
        if (endsAt <= startsAt) {
            throw new common_1.BadRequestException('endsAt must be after startsAt');
        }
        if (dto.type === create_promotion_dto_1.PromotionType.PERCENT && dto.amount > 100) {
            throw new common_1.BadRequestException('Percent amount must be <= 100');
        }
        const code = dto.code.trim().toUpperCase();
        const existing = await this.prisma.promotion.findUnique({
            where: { code },
            select: { id: true },
        });
        if (existing) {
            throw new common_1.ConflictException('Promotion code already exists');
        }
        let vendorId = null;
        if (role === client_1.Role.VENDOR) {
            const vendor = await this.prisma.vendor.findFirst({
                where: { ownerUserId: userId },
                select: { id: true },
            });
            if (!vendor) {
                throw new common_1.NotFoundException('Vendor not found for user');
            }
            vendorId = vendor.id;
        }
        return this.prisma.promotion.create({
            data: {
                vendorId,
                code,
                type: dto.type,
                amount: dto.amount,
                startsAt,
                endsAt,
                minOrder: dto.minOrder ?? null,
            },
        });
    }
    list(query) {
        const now = new Date();
        return this.prisma.promotion.findMany({
            where: {
                vendorId: query.vendorId,
                ...(query.active
                    ? {
                        startsAt: { lte: now },
                        endsAt: { gte: now },
                    }
                    : {}),
            },
            orderBy: [{ startsAt: 'desc' }, { code: 'asc' }],
        });
    }
    async validate(dto) {
        const now = new Date();
        const code = dto.code.trim().toUpperCase();
        const promo = await this.prisma.promotion.findUnique({
            where: { code },
        });
        if (!promo) {
            throw new common_1.NotFoundException('Promotion not found');
        }
        if (promo.startsAt > now || promo.endsAt < now) {
            throw new common_1.BadRequestException('Promotion is not active');
        }
        if (promo.vendorId && !dto.vendorId) {
            throw new common_1.BadRequestException('vendorId is required for this promotion');
        }
        if (promo.vendorId && dto.vendorId && promo.vendorId !== dto.vendorId) {
            throw new common_1.BadRequestException('Promotion does not apply to this vendor');
        }
        if (promo.minOrder !== null && dto.orderTotal < promo.minOrder) {
            throw new common_1.BadRequestException('Order total does not meet minimum order');
        }
        const discount = promo.type === create_promotion_dto_1.PromotionType.PERCENT
            ? Math.floor((dto.orderTotal * promo.amount) / 100)
            : promo.amount;
        return {
            valid: true,
            code: promo.code,
            type: promo.type,
            amount: promo.amount,
            minOrder: promo.minOrder,
            vendorId: promo.vendorId,
            discount: Math.min(discount, dto.orderTotal),
        };
    }
};
exports.PromotionsService = PromotionsService;
exports.PromotionsService = PromotionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PromotionsService);
