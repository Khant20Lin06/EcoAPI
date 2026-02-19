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
exports.CartDomainService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let CartDomainService = class CartDomainService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getCart(userId) {
        const cart = await this.prisma.cart.findFirst({
            where: { userId },
            include: {
                vendor: true,
                items: {
                    include: {
                        variant: {
                            include: { product: true }
                        }
                    }
                }
            }
        });
        if (!cart) {
            return { items: [] };
        }
        return cart;
    }
    async addItem(userId, payload) {
        const variant = await this.prisma.productVariant.findUnique({
            where: { id: payload.variantId },
            include: { product: { include: { vendor: true } } }
        });
        if (!variant || !variant.product) {
            throw new common_1.NotFoundException('Variant not found');
        }
        if (variant.product.status !== client_1.ProductStatus.ACTIVE) {
            throw new common_1.BadRequestException('Product is not active');
        }
        if (variant.product.vendor.status !== client_1.VendorStatus.APPROVED) {
            throw new common_1.BadRequestException('Vendor is not approved');
        }
        const cart = await this.prisma.cart.findFirst({
            where: { userId },
            include: { items: true }
        });
        if (cart && cart.vendorId !== variant.product.vendorId) {
            throw new common_1.ConflictException('Cart can only contain items from one vendor');
        }
        const availableQty = variant.stockQty - variant.reservedQty;
        const existingItem = cart?.items.find((item) => item.variantId === variant.id);
        const desiredQty = (existingItem?.qty ?? 0) + payload.qty;
        if (desiredQty > availableQty) {
            throw new common_1.BadRequestException('Insufficient stock');
        }
        if (!cart) {
            return this.prisma.cart.create({
                data: {
                    userId,
                    vendorId: variant.product.vendorId,
                    currency: variant.product.vendor.currency,
                    items: {
                        create: {
                            variantId: variant.id,
                            qty: payload.qty,
                            unitPrice: variant.price
                        }
                    }
                },
                include: {
                    vendor: true,
                    items: {
                        include: {
                            variant: { include: { product: true } }
                        }
                    }
                }
            });
        }
        if (existingItem) {
            await this.prisma.cartItem.update({
                where: { id: existingItem.id },
                data: { qty: desiredQty, unitPrice: variant.price }
            });
        }
        else {
            await this.prisma.cartItem.create({
                data: {
                    cartId: cart.id,
                    variantId: variant.id,
                    qty: payload.qty,
                    unitPrice: variant.price
                }
            });
        }
        return this.getCart(userId);
    }
    async updateItem(userId, id, payload) {
        const cartItem = await this.prisma.cartItem.findFirst({
            where: { id },
            include: { cart: true, variant: true }
        });
        if (!cartItem || cartItem.cart.userId !== userId) {
            throw new common_1.NotFoundException('Cart item not found');
        }
        const availableQty = cartItem.variant.stockQty - cartItem.variant.reservedQty;
        if (payload.qty > availableQty) {
            throw new common_1.BadRequestException('Insufficient stock');
        }
        await this.prisma.cartItem.update({
            where: { id },
            data: { qty: payload.qty }
        });
        return this.getCart(userId);
    }
    async removeItem(userId, id) {
        const cartItem = await this.prisma.cartItem.findFirst({
            where: { id },
            include: { cart: true }
        });
        if (!cartItem || cartItem.cart.userId !== userId) {
            throw new common_1.NotFoundException('Cart item not found');
        }
        await this.prisma.cartItem.delete({ where: { id } });
        const remaining = await this.prisma.cartItem.count({ where: { cartId: cartItem.cartId } });
        if (remaining === 0) {
            await this.prisma.cart.delete({ where: { id: cartItem.cartId } });
        }
        return { ok: true };
    }
};
exports.CartDomainService = CartDomainService;
exports.CartDomainService = CartDomainService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CartDomainService);
