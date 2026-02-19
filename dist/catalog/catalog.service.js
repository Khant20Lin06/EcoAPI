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
exports.CatalogService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let CatalogService = class CatalogService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listProducts(query) {
        const limit = query.limit ?? 20;
        const and = [{ status: client_1.ProductStatus.ACTIVE }];
        if (query.q) {
            and.push({
                OR: [
                    { title: { contains: query.q, mode: 'insensitive' } },
                    { description: { contains: query.q, mode: 'insensitive' } }
                ]
            });
        }
        if (query.categoryId) {
            and.push({ categoryId: query.categoryId });
        }
        if (query.tagIds && query.tagIds.length > 0) {
            and.push({
                tags: {
                    some: {
                        tagId: { in: query.tagIds }
                    }
                }
            });
        }
        if (query.cursor) {
            const cursor = this.decodeCursor(query.cursor);
            and.push({
                OR: [
                    { createdAt: { lt: new Date(cursor.createdAt) } },
                    {
                        createdAt: new Date(cursor.createdAt),
                        id: { lt: cursor.id }
                    }
                ]
            });
        }
        const items = await this.prisma.product.findMany({
            where: { AND: and },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
            include: {
                images: true,
                variants: true,
                tags: {
                    include: { tag: true }
                }
            }
        });
        const hasNext = items.length > limit;
        const pageItems = hasNext ? items.slice(0, limit) : items;
        const lastItem = pageItems.at(-1);
        const nextCursor = hasNext && lastItem ? this.encodeCursor(lastItem) : null;
        return { items: pageItems, nextCursor };
    }
    async getProduct(id) {
        const product = await this.prisma.product.findFirst({
            where: { id, status: client_1.ProductStatus.ACTIVE },
            include: {
                images: true,
                variants: true,
                tags: { include: { tag: true } },
                category: true,
                vendor: true
            }
        });
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        return product;
    }
    async listCategories() {
        const items = await this.prisma.category.findMany({
            orderBy: { name: 'asc' }
        });
        return { items };
    }
    async listTags() {
        const items = await this.prisma.sustainabilityTag.findMany({
            where: { active: true },
            orderBy: { name: 'asc' }
        });
        return { items };
    }
    encodeCursor(product) {
        const payload = {
            createdAt: product.createdAt.toISOString(),
            id: product.id
        };
        return Buffer.from(JSON.stringify(payload)).toString('base64');
    }
    decodeCursor(cursor) {
        const raw = Buffer.from(cursor, 'base64').toString('utf8');
        return JSON.parse(raw);
    }
};
exports.CatalogService = CatalogService;
exports.CatalogService = CatalogService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CatalogService);
