import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ country: 'asc' }, { city: 'asc' }, { name: 'asc' }]
    });
  }

  create(userId: string, dto: CreateAddressDto) {
    return this.prisma.address.create({
      data: {
        userId,
        name: dto.name,
        line1: dto.line1,
        line2: dto.line2,
        city: dto.city,
        state: dto.state,
        postal: dto.postal,
        country: dto.country.toUpperCase(),
        phone: dto.phone
      }
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    const address = await this.prisma.address.findFirst({
      where: { id, userId },
      select: { id: true }
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return this.prisma.address.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.country ? { country: dto.country.toUpperCase() } : {})
      }
    });
  }

  async remove(userId: string, id: string) {
    const address = await this.prisma.address.findFirst({
      where: { id, userId },
      select: { id: true }
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }

    await this.prisma.address.delete({ where: { id } });
    return { ok: true };
  }
}
