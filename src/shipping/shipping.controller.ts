import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreatePickupLocationDto } from './dto/create-pickup-location.dto';
import { ListPickupLocationsQueryDto } from './dto/list-pickup-locations.dto';
import { ListShippingRatesQueryDto } from './dto/list-rates.dto';
import { ShippingService } from './shipping.service';

@ApiTags('shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('rates')
  listRates(@Query() query: ListShippingRatesQueryDto) {
    return this.shippingService.listRates(query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('pickup-locations')
  listPickupLocations(
    @CurrentUser() user: { userId: string; role: Role },
    @Query() query: ListPickupLocationsQueryDto,
  ) {
    return this.shippingService.listPickupLocations(query, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @Post('pickup-locations')
  createPickupLocation(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreatePickupLocationDto,
  ) {
    return this.shippingService.createPickupLocation(user.userId, dto);
  }
}
