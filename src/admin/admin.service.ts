import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, VendorStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { CreateVendorAdminDto } from './dto/create-vendor-admin.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { UpdateVendorAdminDto } from './dto/update-vendor-admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [userCount, vendorCount, pendingVendorCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.vendor.count(),
      this.prisma.vendor.count({ where: { status: VendorStatus.PENDING } })
    ]);

    return {
      userCount,
      vendorCount,
      pendingVendorCount
    };
  }

  async listVendors() {
    const items = await this.prisma.vendor.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });
    return { items };
  }

  async getVendor(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return vendor;
  }

  async createVendor(payload: CreateVendorAdminDto) {
    const owner = await this.prisma.user.findUnique({
      where: { email: payload.ownerEmail }
    });
    if (!owner) {
      throw new NotFoundException('Vendor owner user not found');
    }
    if (owner.role !== Role.VENDOR) {
      throw new BadRequestException('Owner user must have VENDOR role');
    }

    return this.prisma.vendor.create({
      data: {
        ownerUserId: owner.id,
        status: payload.status ?? VendorStatus.PENDING,
        name: payload.name,
        country: payload.country.toUpperCase(),
        currency: payload.currency.toUpperCase(),
        commissionPct: payload.commissionPct
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });
  }

  async updateVendor(id: string, payload: UpdateVendorAdminDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return this.prisma.vendor.update({
      where: { id },
      data: {
        status: payload.status,
        name: payload.name,
        country: payload.country?.toUpperCase(),
        currency: payload.currency?.toUpperCase(),
        commissionPct: payload.commissionPct
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });
  }

  async approveVendor(id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return this.prisma.vendor.update({
      where: { id },
      data: { status: VendorStatus.APPROVED }
    });
  }

  async suspendVendor(id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return this.prisma.vendor.update({
      where: { id },
      data: { status: VendorStatus.SUSPENDED }
    });
  }

  async createTag(payload: CreateTagDto) {
    const fallbackName = payload.name?.trim();
    const enName = payload.en_name?.trim() || fallbackName;
    const mmName = payload.mm_name?.trim() || fallbackName;
    if (!enName || !mmName) {
      throw new BadRequestException('en_name and mm_name are required');
    }

    const created = await this.prisma.sustainabilityTag.create({
      data: {
        name: enName,
        en_name: enName,
        mm_name: mmName,
        slug: payload.slug,
        description: payload.description,
        active: payload.active ?? true
      }
    });
    return { ...created, name: created.en_name };
  }

  async updateTag(id: string, payload: UpdateTagDto) {
    const tag = await this.prisma.sustainabilityTag.findUnique({ where: { id } });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    const fallbackName = payload.name?.trim();

    const updated = await this.prisma.sustainabilityTag.update({
      where: { id },
      data: {
        name: payload.en_name?.trim() || fallbackName,
        en_name: payload.en_name?.trim() || fallbackName,
        mm_name: payload.mm_name?.trim() || fallbackName,
        slug: payload.slug,
        description: payload.description,
        active: payload.active
      }
    });
    return { ...updated, name: updated.en_name };
  }

  async createCategory(payload: CreateCategoryDto) {
    const fallbackName = payload.name?.trim();
    const enName = payload.en_name?.trim() || fallbackName;
    const mmName = payload.mm_name?.trim() || fallbackName;
    if (!enName || !mmName) {
      throw new BadRequestException('en_name and mm_name are required');
    }

    const created = await this.prisma.category.create({
      data: {
        name: enName,
        en_name: enName,
        mm_name: mmName,
        slug: payload.slug,
        parentId: payload.parentId
      }
    });
    return { ...created, name: created.en_name };
  }

  async updateCategory(id: string, payload: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const fallbackName = payload.name?.trim();

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        name: payload.en_name?.trim() || fallbackName,
        en_name: payload.en_name?.trim() || fallbackName,
        mm_name: payload.mm_name?.trim() || fallbackName,
        slug: payload.slug,
        parentId: payload.parentId
      }
    });
    return { ...updated, name: updated.en_name };
  }

  async updateShippingRateStatus(id: string, active: boolean) {
    const rate = await this.prisma.shippingRate.findUnique({ where: { id } });
    if (!rate) {
      throw new NotFoundException('Shipping rate not found');
    }

    return this.prisma.shippingRate.update({
      where: { id },
      data: { active }
    });
  }
}
