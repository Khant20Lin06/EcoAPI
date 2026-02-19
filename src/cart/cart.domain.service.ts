import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { ProductStatus, VendorStatus } from '@prisma/client';

@Injectable()
export class CartDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId: string) {
    const cart = await this.prisma.cart.findFirst({
      where: {
        userId,
        items: {
          some: {}
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
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

  async addItem(userId: string, payload: AddCartItemDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: payload.variantId },
      include: { product: { include: { vendor: true } } }
    });

    if (!variant || !variant.product) {
      throw new NotFoundException('Variant not found');
    }

    if (variant.product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Product is not active');
    }

    if (variant.product.vendor.status !== VendorStatus.APPROVED) {
      throw new BadRequestException('Vendor is not approved');
    }

    const cart = await this.prisma.cart.findFirst({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: { items: true }
    });

    if (cart && cart.items.length > 0 && cart.vendorId !== variant.product.vendorId) {
      throw new ConflictException('Cart can only contain items from one vendor');
    }

    const availableQty = variant.stockQty - variant.reservedQty;
    const existingItem = cart?.items.find((item) => item.variantId === variant.id);
    const desiredQty = (existingItem?.qty ?? 0) + payload.qty;
    if (desiredQty > availableQty) {
      throw new BadRequestException('Insufficient stock');
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

    if (cart.items.length === 0) {
      await this.prisma.cart.update({
        where: { id: cart.id },
        data: {
          vendorId: variant.product.vendorId,
          currency: variant.product.vendor.currency
        }
      });
    }

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { qty: desiredQty, unitPrice: variant.price }
      });
    } else {
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

  async updateItem(userId: string, id: string, payload: UpdateCartItemDto) {
    const cartItem = await this.prisma.cartItem.findFirst({
      where: { id },
      include: { cart: true, variant: true }
    });

    if (!cartItem || cartItem.cart.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    const availableQty = cartItem.variant.stockQty - cartItem.variant.reservedQty;
    if (payload.qty > availableQty) {
      throw new BadRequestException('Insufficient stock');
    }

    await this.prisma.cartItem.update({
      where: { id },
      data: { qty: payload.qty }
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, id: string) {
    const cartItem = await this.prisma.cartItem.findFirst({
      where: { id },
      include: { cart: true }
    });

    if (!cartItem || cartItem.cart.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({ where: { id } });

    const remaining = await this.prisma.cartItem.count({ where: { cartId: cartItem.cartId } });
    if (remaining === 0) {
      await this.prisma.cart.delete({ where: { id: cartItem.cartId } });
    }

    return { ok: true };
  }
}
