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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let AdminService = class AdminService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listVendors() {
        const items = await this.prisma.vendor.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return { items };
    }
    async approveVendor(id) {
        const vendor = await this.prisma.vendor.findUnique({ where: { id } });
        if (!vendor) {
            throw new common_1.NotFoundException('Vendor not found');
        }
        return this.prisma.vendor.update({
            where: { id },
            data: { status: client_1.VendorStatus.APPROVED }
        });
    }
    async createTag(payload) {
        return this.prisma.sustainabilityTag.create({
            data: {
                name: payload.name,
                slug: payload.slug,
                description: payload.description,
                active: payload.active ?? true
            }
        });
    }
    async updateTag(id, payload) {
        const tag = await this.prisma.sustainabilityTag.findUnique({ where: { id } });
        if (!tag) {
            throw new common_1.NotFoundException('Tag not found');
        }
        return this.prisma.sustainabilityTag.update({
            where: { id },
            data: {
                name: payload.name,
                slug: payload.slug,
                description: payload.description,
                active: payload.active
            }
        });
    }
    async createCategory(payload) {
        return this.prisma.category.create({
            data: {
                name: payload.name,
                slug: payload.slug,
                parentId: payload.parentId
            }
        });
    }
    async updateCategory(id, payload) {
        const category = await this.prisma.category.findUnique({ where: { id } });
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        return this.prisma.category.update({
            where: { id },
            data: {
                name: payload.name,
                slug: payload.slug,
                parentId: payload.parentId
            }
        });
    }
    async updateShippingRateStatus(id, active) {
        const rate = await this.prisma.shippingRate.findUnique({ where: { id } });
        if (!rate) {
            throw new common_1.NotFoundException('Shipping rate not found');
        }
        return this.prisma.shippingRate.update({
            where: { id },
            data: { active }
        });
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminService);
