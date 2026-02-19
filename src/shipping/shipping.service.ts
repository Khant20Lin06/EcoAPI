import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, VendorStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePickupLocationDto } from './dto/create-pickup-location.dto';
import { CreateShippingRateDto } from './dto/create-shipping-rate.dto';
import { ListPickupLocationsQueryDto } from './dto/list-pickup-locations.dto';
import { ListShippingRatesQueryDto } from './dto/list-rates.dto';
import { ListVendorShippingRatesQueryDto } from './dto/list-vendor-shipping-rates-query.dto';
import { UpdateShippingRateDto } from './dto/update-shipping-rate.dto';

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  async createPickupLocation(userId: string, dto: CreatePickupLocationDto) {
    const vendor = await this.getVendorByOwner(userId);

    if (vendor.status !== VendorStatus.APPROVED) {
      throw new ForbiddenException('Vendor is not approved');
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

  async listPickupLocations(
    query: ListPickupLocationsQueryDto,
    user?: { userId: string; role: Role },
  ) {
    if (!query.vendorId && user?.role !== Role.VENDOR) {
      throw new BadRequestException('vendorId is required');
    }

    let vendorId = query.vendorId;

    if (!vendorId && user?.role === Role.VENDOR) {
      const vendor = await this.getVendorByOwner(user.userId);
      vendorId = vendor.id;
    }

    return this.prisma.pickupLocation.findMany({
      where: { vendorId },
      orderBy: [{ country: 'asc' }, { city: 'asc' }, { name: 'asc' }],
    });
  }

  async listRates(query: ListShippingRatesQueryDto) {
    if (!query.vendorId) {
      throw new BadRequestException('vendorId is required');
    }

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: query.vendorId },
      select: { id: true, currency: true, country: true, status: true },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    if (vendor.status !== VendorStatus.APPROVED) {
      throw new BadRequestException('Vendor is not available for checkout');
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

  async listVendorRates(userId: string, query: ListVendorShippingRatesQueryDto) {
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

  async createVendorRate(userId: string, dto: CreateShippingRateDto) {
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
      throw new ConflictException('Shipping rate for this country already exists');
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

  async updateVendorRate(userId: string, id: string, dto: UpdateShippingRateDto) {
    const vendor = await this.getVendorByOwner(userId);
    const rate = await this.prisma.shippingRate.findFirst({
      where: { id, vendorId: vendor.id },
    });
    if (!rate) {
      throw new NotFoundException('Shipping rate not found');
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
        throw new ConflictException('Shipping rate for this country already exists');
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

  async disableVendorRate(userId: string, id: string) {
    const vendor = await this.getVendorByOwner(userId);
    const rate = await this.prisma.shippingRate.findFirst({
      where: { id, vendorId: vendor.id },
      select: { id: true },
    });
    if (!rate) {
      throw new NotFoundException('Shipping rate not found');
    }

    return this.prisma.shippingRate.update({
      where: { id },
      data: { active: false },
    });
  }

  async adminUpdateRateStatus(rateId: string, active: boolean) {
    const rate = await this.prisma.shippingRate.findUnique({
      where: { id: rateId },
      select: { id: true },
    });
    if (!rate) {
      throw new NotFoundException('Shipping rate not found');
    }

    return this.prisma.shippingRate.update({
      where: { id: rateId },
      data: { active },
    });
  }

  async resolveShippingRateForVendor(vendorId: string, country: string) {
    return this.prisma.shippingRate.findFirst({
      where: {
        vendorId,
        country: country.toUpperCase(),
        active: true,
      },
    });
  }

  private async getVendorByOwner(userId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { ownerUserId: userId },
      select: { id: true, currency: true, status: true },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found for user');
    }
    return vendor;
  }

  private ensureRateCurrency(vendorCurrency: string, rateCurrency: string) {
    if (vendorCurrency.toUpperCase() !== rateCurrency.toUpperCase()) {
      throw new BadRequestException('Shipping rate currency must match vendor currency');
    }
  }
}
