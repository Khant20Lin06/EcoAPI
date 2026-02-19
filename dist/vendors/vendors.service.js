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
exports.VendorsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let VendorsService = class VendorsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async apply(userId, payload) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { emailVerifiedAt: true }
        });
        if (!user?.emailVerifiedAt) {
            throw new common_1.ForbiddenException('Email verification required');
        }
        const existing = await this.prisma.vendor.findFirst({ where: { ownerUserId: userId } });
        if (existing) {
            throw new common_1.ConflictException('Vendor already exists');
        }
        return this.prisma.vendor.create({
            data: {
                ownerUserId: userId,
                status: client_1.VendorStatus.PENDING,
                name: payload.name,
                country: payload.country,
                currency: payload.currency,
                commissionPct: payload.commissionPct ?? 10
            }
        });
    }
    async listProducts(userId) {
        const vendor = await this.getVendor(userId);
        const items = await this.prisma.product.findMany({
            where: { vendorId: vendor.id },
            orderBy: { createdAt: 'desc' },
            include: {
                variants: true,
                images: true,
                tags: { include: { tag: true } }
            }
        });
        return { items };
    }
    async createProduct(userId, payload) {
        const vendor = await this.getVendor(userId);
        await this.ensureCategory(payload.categoryId);
        const tagIds = await this.validateTags(payload.tagIds);
        return this.prisma.product.create({
            data: {
                vendorId: vendor.id,
                categoryId: payload.categoryId,
                title: payload.title,
                description: payload.description,
                status: client_1.ProductStatus.ACTIVE,
                tags: tagIds.length
                    ? {
                        createMany: {
                            data: tagIds.map((tagId) => ({ tagId }))
                        }
                    }
                    : undefined
            },
            include: {
                variants: true,
                images: true,
                tags: { include: { tag: true } }
            }
        });
    }
    async updateProduct(userId, productId, payload) {
        const vendor = await this.getVendor(userId);
        const product = await this.prisma.product.findFirst({
            where: { id: productId, vendorId: vendor.id }
        });
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        if (payload.categoryId) {
            await this.ensureCategory(payload.categoryId);
        }
        let tagUpdate;
        if (payload.tagIds) {
            const tagIds = await this.validateTags(payload.tagIds);
            tagUpdate = {
                deleteMany: {},
                createMany: tagIds.length ? { data: tagIds.map((tagId) => ({ tagId })) } : undefined
            };
        }
        return this.prisma.product.update({
            where: { id: productId },
            data: {
                title: payload.title,
                description: payload.description,
                categoryId: payload.categoryId,
                status: payload.status,
                tags: tagUpdate
            },
            include: {
                variants: true,
                images: true,
                tags: { include: { tag: true } }
            }
        });
    }
    async addVariant(userId, productId, payload) {
        const vendor = await this.getVendor(userId);
        const product = await this.ensureProductOwner(productId, vendor.id);
        this.ensureCurrencyMatch(vendor.currency, payload.currency);
        return this.prisma.productVariant.create({
            data: {
                productId: product.id,
                sku: payload.sku,
                options: payload.options,
                price: payload.price,
                currency: payload.currency,
                stockQty: payload.stockQty,
                weightG: payload.weightG
            }
        });
    }
    async updateVariant(userId, productId, variantId, payload) {
        const vendor = await this.getVendor(userId);
        await this.ensureProductOwner(productId, vendor.id);
        if (payload.currency) {
            this.ensureCurrencyMatch(vendor.currency, payload.currency);
        }
        const variant = await this.prisma.productVariant.findFirst({
            where: { id: variantId, productId }
        });
        if (!variant) {
            throw new common_1.NotFoundException('Variant not found');
        }
        return this.prisma.productVariant.update({
            where: { id: variantId },
            data: {
                sku: payload.sku,
                options: payload.options,
                price: payload.price,
                currency: payload.currency,
                stockQty: payload.stockQty,
                weightG: payload.weightG
            }
        });
    }
    async addImages(userId, productId, payload) {
        const vendor = await this.getVendor(userId);
        await this.ensureProductOwner(productId, vendor.id);
        if (!payload.images || payload.images.length === 0) {
            throw new common_1.BadRequestException('Images required');
        }
        const existingCount = await this.prisma.productImage.count({ where: { productId } });
        const data = payload.images.map((image, index) => ({
            productId,
            url: image.url,
            altText: image.altText,
            sortOrder: image.sortOrder ?? existingCount + index
        }));
        await this.prisma.productImage.createMany({ data });
        return { ok: true, count: data.length };
    }
    async getVendor(userId) {
        const vendor = await this.prisma.vendor.findFirst({
            where: { ownerUserId: userId }
        });
        if (!vendor) {
            throw new common_1.NotFoundException('Vendor not found');
        }
        return vendor;
    }
    ensureCurrencyMatch(vendorCurrency, variantCurrency) {
        if (vendorCurrency !== variantCurrency) {
            throw new common_1.BadRequestException('Variant currency must match vendor currency');
        }
    }
    async ensureProductOwner(productId, vendorId) {
        const product = await this.prisma.product.findFirst({
            where: { id: productId, vendorId }
        });
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        return product;
    }
    async ensureCategory(categoryId) {
        const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
        if (!category) {
            throw new common_1.BadRequestException('Invalid category');
        }
    }
    async validateTags(tagIds) {
        if (!tagIds || tagIds.length === 0) {
            return [];
        }
        const tags = await this.prisma.sustainabilityTag.findMany({
            where: { id: { in: tagIds }, active: true }
        });
        if (tags.length !== tagIds.length) {
            throw new common_1.BadRequestException('Invalid tags');
        }
        return tagIds;
    }
};
exports.VendorsService = VendorsService;
exports.VendorsService = VendorsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], VendorsService);
