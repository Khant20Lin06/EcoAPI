import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyVendorDto } from './dto/apply-vendor.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AddProductImagesDto } from './dto/product-image.dto';
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';
import { Prisma, ProductStatus, VendorStatus } from '@prisma/client';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(userId: string, payload: ApplyVendorDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true }
    });

    if (!user?.emailVerifiedAt) {
      throw new ForbiddenException('Email verification required');
    }

    const existing = await this.prisma.vendor.findFirst({ where: { ownerUserId: userId } });
    if (existing) {
      throw new ConflictException('Vendor already exists');
    }

    return this.prisma.vendor.create({
      data: {
        ownerUserId: userId,
        status: VendorStatus.PENDING,
        name: payload.name,
        country: payload.country,
        currency: payload.currency,
        commissionPct: payload.commissionPct ?? 10
      }
    });
  }

  async listProducts(userId: string) {
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

  async createProduct(userId: string, payload: CreateProductDto) {
    const vendor = await this.getVendor(userId);

    await this.ensureCategory(payload.categoryId);
    const tagIds = await this.validateTags(payload.tagIds);

    return this.prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: payload.categoryId,
        title: payload.title,
        description: payload.description,
        status: ProductStatus.ACTIVE,
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

  async updateProduct(userId: string, productId: string, payload: UpdateProductDto) {
    const vendor = await this.getVendor(userId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, vendorId: vendor.id }
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (payload.categoryId) {
      await this.ensureCategory(payload.categoryId);
    }

    let tagUpdate:
      | {
          deleteMany: Record<string, never>;
          createMany?: { data: { tagId: string }[] };
        }
      | undefined;

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

  async deleteProduct(userId: string, productId: string) {
    const vendor = await this.getVendor(userId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, vendorId: vendor.id },
      include: {
        variants: { select: { id: true } }
      }
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const variantIds = product.variants.map((variant) => variant.id);
    const orderItemCount =
      variantIds.length > 0
        ? await this.prisma.orderItem.count({
            where: {
              variantId: { in: variantIds }
            }
          })
        : 0;

    if (orderItemCount > 0) {
      await this.prisma.product.update({
        where: { id: product.id },
        data: { status: ProductStatus.ARCHIVED }
      });
      return {
        ok: true,
        mode: 'ARCHIVED',
        reason: 'Product referenced by orders'
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productTag.deleteMany({ where: { productId: product.id } });
      await tx.productImage.deleteMany({ where: { productId: product.id } });
      await tx.wishlistItem.deleteMany({ where: { productId: product.id } });
      if (variantIds.length > 0) {
        await tx.cartItem.deleteMany({
          where: {
            variantId: { in: variantIds }
          }
        });
      }
      await tx.productVariant.deleteMany({ where: { productId: product.id } });
      await tx.product.delete({ where: { id: product.id } });
    });

    return { ok: true, mode: 'DELETED' };
  }

  async addVariant(userId: string, productId: string, payload: CreateVariantDto) {
    const vendor = await this.getVendor(userId);
    const product = await this.ensureProductOwner(productId, vendor.id);
    const vendorCurrency = vendor.currency.toUpperCase();

    return this.prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: payload.sku,
        options: payload.options as unknown as Prisma.InputJsonValue,
        price: payload.price,
        // Always enforce vendor currency on variants.
        currency: vendorCurrency,
        stockQty: payload.stockQty,
        weightG: payload.weightG
      }
    });
  }

  async updateVariant(
    userId: string,
    productId: string,
    variantId: string,
    payload: UpdateVariantDto
  ) {
    const vendor = await this.getVendor(userId);
    await this.ensureProductOwner(productId, vendor.id);

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId }
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    const normalizedCurrency = payload.currency?.toUpperCase();
    const nextCurrency = normalizedCurrency
      ? vendor.currency.toUpperCase()
      : undefined;

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        sku: payload.sku,
        options: payload.options as unknown as Prisma.InputJsonValue,
        price: payload.price,
        currency: nextCurrency,
        stockQty: payload.stockQty,
        weightG: payload.weightG
      }
    });
  }

  async deleteVariant(userId: string, productId: string, variantId: string) {
    const vendor = await this.getVendor(userId);
    await this.ensureProductOwner(productId, vendor.id);

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
      select: { id: true }
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    const usedInOrders = await this.prisma.orderItem.count({
      where: { variantId }
    });
    if (usedInOrders > 0) {
      const current = await this.prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { reservedQty: true }
      });
      await this.prisma.productVariant.update({
        where: { id: variantId },
        data: {
          stockQty: current?.reservedQty ?? 0
        }
      });
      return {
        ok: true,
        mode: 'DISABLED',
        reason: 'Variant used by orders, set stock to reserved quantity'
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({
        where: { variantId }
      });
      await tx.productVariant.delete({
        where: { id: variantId }
      });
    });

    return { ok: true, mode: 'DELETED' };
  }

  async addImages(userId: string, productId: string, payload: AddProductImagesDto) {
    const vendor = await this.getVendor(userId);
    await this.ensureProductOwner(productId, vendor.id);

    if (!payload.images || payload.images.length === 0) {
      throw new BadRequestException('Images required');
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

  private async getVendor(userId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { ownerUserId: userId }
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    return vendor;
  }

  private ensureCurrencyMatch(vendorCurrency: string, variantCurrency: string) {
    if (vendorCurrency !== variantCurrency) {
      throw new BadRequestException('Variant currency must match vendor currency');
    }
  }

  private async ensureProductOwner(productId: string, vendorId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, vendorId }
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  private async ensureCategory(categoryId: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw new BadRequestException('Invalid category');
    }
  }

  private async validateTags(tagIds?: string[]) {
    if (!tagIds || tagIds.length === 0) {
      return [];
    }

    const tags = await this.prisma.sustainabilityTag.findMany({
      where: { id: { in: tagIds }, active: true }
    });

    if (tags.length !== tagIds.length) {
      throw new BadRequestException('Invalid tags');
    }

    return tagIds;
  }
}
