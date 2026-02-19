import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePromotionDto,
  PromotionType,
} from './dto/create-promotion.dto';
import { ListPromotionsQueryDto } from './dto/list-promotions.dto';
import { ValidatePromotionDto } from './dto/validate-promotion.dto';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, role: Role, dto: CreatePromotionDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Invalid startsAt or endsAt');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    if (dto.type === PromotionType.PERCENT && dto.amount > 100) {
      throw new BadRequestException('Percent amount must be <= 100');
    }

    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.promotion.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Promotion code already exists');
    }

    let vendorId: string | null = null;
    if (role === Role.VENDOR) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { ownerUserId: userId },
        select: { id: true },
      });
      if (!vendor) {
        throw new NotFoundException('Vendor not found for user');
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

  list(query: ListPromotionsQueryDto) {
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

  async validate(dto: ValidatePromotionDto) {
    const now = new Date();
    const code = dto.code.trim().toUpperCase();

    const promo = await this.prisma.promotion.findUnique({
      where: { code },
    });
    if (!promo) {
      throw new NotFoundException('Promotion not found');
    }

    if (promo.startsAt > now || promo.endsAt < now) {
      throw new BadRequestException('Promotion is not active');
    }

    if (promo.vendorId && !dto.vendorId) {
      throw new BadRequestException('vendorId is required for this promotion');
    }
    if (promo.vendorId && dto.vendorId && promo.vendorId !== dto.vendorId) {
      throw new BadRequestException('Promotion does not apply to this vendor');
    }
    if (promo.minOrder !== null && dto.orderTotal < promo.minOrder) {
      throw new BadRequestException('Order total does not meet minimum order');
    }

    const discount =
      promo.type === PromotionType.PERCENT
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
}
