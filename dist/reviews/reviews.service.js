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
exports.ReviewsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let ReviewsService = class ReviewsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, dto) {
        const orderItem = await this.prisma.orderItem.findUnique({
            where: { id: dto.orderItemId },
            include: {
                order: {
                    select: {
                        id: true,
                        userId: true,
                        status: true,
                    },
                },
            },
        });
        if (!orderItem) {
            throw new common_1.NotFoundException('Order item not found');
        }
        if (orderItem.order.userId !== userId) {
            throw new common_1.ForbiddenException('You can only review your own purchases');
        }
        const reviewableStatuses = [
            client_1.OrderStatus.DELIVERED,
            client_1.OrderStatus.PICKED_UP,
            client_1.OrderStatus.RETURNED,
            client_1.OrderStatus.REFUNDED,
        ];
        if (!reviewableStatuses.includes(orderItem.order.status)) {
            throw new common_1.BadRequestException('Order item is not reviewable yet');
        }
        const existing = await this.prisma.review.findFirst({
            where: { orderItemId: dto.orderItemId },
            select: { id: true },
        });
        if (existing) {
            throw new common_1.ConflictException('Only one review per order item is allowed');
        }
        return this.prisma.review.create({
            data: {
                orderItemId: dto.orderItemId,
                rating: dto.rating,
                comment: dto.comment,
            },
        });
    }
    async list(query) {
        return this.prisma.review.findMany({
            where: query.productId
                ? {
                    orderItem: {
                        variant: {
                            productId: query.productId,
                        },
                    },
                }
                : undefined,
            orderBy: { createdAt: 'desc' },
            include: {
                orderItem: {
                    select: {
                        id: true,
                        variantId: true,
                        variant: {
                            select: {
                                id: true,
                                productId: true,
                                sku: true,
                            },
                        },
                    },
                },
            },
            take: 100,
        });
    }
};
exports.ReviewsService = ReviewsService;
exports.ReviewsService = ReviewsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReviewsService);
