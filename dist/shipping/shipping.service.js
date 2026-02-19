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
exports.ShippingService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let ShippingService = class ShippingService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createPickupLocation(userId, dto) {
        const vendor = await this.getVendorByOwner(userId);
        if (vendor.status !== client_1.VendorStatus.APPROVED) {
            throw new common_1.ForbiddenException('Vendor is not approved');
        }
        return this.prisma.pickupLocation.create({
            data: {
                vendorId: vendor.id,
                name: dto.name,
                line1: dto.line1,
                city: dto.city,
                state: dto.state,
                country: dto.country,
                hours: dto.hours,
            },
        });
    }
    async listPickupLocations(query, user) {
        if (!query.vendorId && user?.role !== client_1.Role.VENDOR) {
            throw new common_1.BadRequestException('vendorId is required');
        }
        let vendorId = query.vendorId;
        if (!vendorId && user?.role === client_1.Role.VENDOR) {
            const vendor = await this.getVendorByOwner(user.userId);
            vendorId = vendor.id;
        }
        return this.prisma.pickupLocation.findMany({
            where: { vendorId },
            orderBy: [{ country: 'asc' }, { city: 'asc' }, { name: 'asc' }],
        });
    }
    async listRates(query) {
        if (!query.vendorId) {
            throw new common_1.BadRequestException('vendorId is required');
        }
        const vendor = await this.prisma.vendor.findUnique({
            where: { id: query.vendorId },
            select: { id: true, currency: true, country: true, status: true },
        });
        if (!vendor) {
            throw new common_1.NotFoundException('Vendor not found');
        }
        if (vendor.status !== client_1.VendorStatus.APPROVED) {
            throw new common_1.BadRequestException('Vendor is not available for checkout');
        }
        const targetCountry = (query.country ?? vendor.country).toUpperCase();
        const rate = await this.prisma.shippingRate.findUnique({
            where: {
                vendorId_country: {
                    vendorId: vendor.id,
                    country: targetCountry,
                },
            },
        });
        const available = !!rate?.active;
        return {
            vendorId: vendor.id,
            country: targetCountry,
            currency: vendor.currency,
            available,
            flatRate: available ? rate?.flatRate ?? 0 : null,
            note: available ? 'Shipping available' : 'Shipping unavailable for this country',
        };
    }
    async listVendorRates(userId, query) {
        const vendor = await this.getVendorByOwner(userId);
        const items = await this.prisma.shippingRate.findMany({
            where: {
                vendorId: vendor.id,
                country: query.country?.toUpperCase(),
                active: query.active,
            },
            orderBy: [{ country: 'asc' }, { createdAt: 'desc' }],
        });
        return { items };
    }
    async createVendorRate(userId, dto) {
        const vendor = await this.getVendorByOwner(userId);
        this.ensureRateCurrency(vendor.currency, dto.currency);
        const country = dto.country.toUpperCase();
        const existing = await this.prisma.shippingRate.findUnique({
            where: {
                vendorId_country: {
                    vendorId: vendor.id,
                    country,
                },
            },
            select: { id: true },
        });
        if (existing) {
            throw new common_1.ConflictException('Shipping rate for this country already exists');
        }
        return this.prisma.shippingRate.create({
            data: {
                vendorId: vendor.id,
                country,
                flatRate: dto.flatRate,
                currency: dto.currency.toUpperCase(),
                active: dto.active ?? true,
            },
        });
    }
    async updateVendorRate(userId, id, dto) {
        const vendor = await this.getVendorByOwner(userId);
        const rate = await this.prisma.shippingRate.findFirst({
            where: { id, vendorId: vendor.id },
        });
        if (!rate) {
            throw new common_1.NotFoundException('Shipping rate not found');
        }
        if (dto.currency) {
            this.ensureRateCurrency(vendor.currency, dto.currency);
        }
        const nextCountry = dto.country?.toUpperCase() ?? rate.country;
        if (nextCountry !== rate.country) {
            const duplicate = await this.prisma.shippingRate.findUnique({
                where: {
                    vendorId_country: {
                        vendorId: vendor.id,
                        country: nextCountry,
                    },
                },
                select: { id: true },
            });
            if (duplicate) {
                throw new common_1.ConflictException('Shipping rate for this country already exists');
            }
        }
        return this.prisma.shippingRate.update({
            where: { id: rate.id },
            data: {
                country: nextCountry,
                flatRate: dto.flatRate,
                currency: dto.currency?.toUpperCase(),
                active: dto.active,
            },
        });
    }
    async disableVendorRate(userId, id) {
        const vendor = await this.getVendorByOwner(userId);
        const rate = await this.prisma.shippingRate.findFirst({
            where: { id, vendorId: vendor.id },
            select: { id: true },
        });
        if (!rate) {
            throw new common_1.NotFoundException('Shipping rate not found');
        }
        return this.prisma.shippingRate.update({
            where: { id },
            data: { active: false },
        });
    }
    async adminUpdateRateStatus(rateId, active) {
        const rate = await this.prisma.shippingRate.findUnique({
            where: { id: rateId },
            select: { id: true },
        });
        if (!rate) {
            throw new common_1.NotFoundException('Shipping rate not found');
        }
        return this.prisma.shippingRate.update({
            where: { id: rateId },
            data: { active },
        });
    }
    async resolveShippingRateForVendor(vendorId, country) {
        return this.prisma.shippingRate.findFirst({
            where: {
                vendorId,
                country: country.toUpperCase(),
                active: true,
            },
        });
    }
    async getVendorByOwner(userId) {
        const vendor = await this.prisma.vendor.findFirst({
            where: { ownerUserId: userId },
            select: { id: true, currency: true, status: true },
        });
        if (!vendor) {
            throw new common_1.NotFoundException('Vendor not found for user');
        }
        return vendor;
    }
    ensureRateCurrency(vendorCurrency, rateCurrency) {
        if (vendorCurrency.toUpperCase() !== rateCurrency.toUpperCase()) {
            throw new common_1.BadRequestException('Shipping rate currency must match vendor currency');
        }
    }
};
exports.ShippingService = ShippingService;
exports.ShippingService = ShippingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ShippingService);
