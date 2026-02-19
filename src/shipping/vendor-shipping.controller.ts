import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateShippingRateDto } from './dto/create-shipping-rate.dto';
import { ListVendorShippingRatesQueryDto } from './dto/list-vendor-shipping-rates-query.dto';
import { UpdateShippingRateDto } from './dto/update-shipping-rate.dto';
import { ShippingService } from './shipping.service';

@ApiTags('vendor-shipping')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@Controller('vendor/shipping')
export class VendorShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('rates')
  listRates(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListVendorShippingRatesQueryDto
  ) {
    return this.shippingService.listVendorRates(user.userId, query);
  }

  @Post('rates')
  createRate(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateShippingRateDto
  ) {
    return this.shippingService.createVendorRate(user.userId, body);
  }

  @Patch('rates/:id')
  updateRate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: UpdateShippingRateDto
  ) {
    return this.shippingService.updateVendorRate(user.userId, id, body);
  }

  @Delete('rates/:id')
  disableRate(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.shippingService.disableVendorRate(user.userId, id);
  }
}
