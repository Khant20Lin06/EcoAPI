import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { Delete } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Role } from '@prisma/client';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { ApplyVendorDto } from './dto/apply-vendor.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';
import { AddProductImagesDto } from './dto/product-image.dto';

@ApiTags('vendor')
@Controller()
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post('vendors/apply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  apply(@CurrentUser() user: CurrentUserPayload, @Body() body: ApplyVendorDto) {
    return this.vendorsService.apply(user.userId, body);
  }

  @Get('vendor/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  listProducts(@CurrentUser() user: CurrentUserPayload) {
    return this.vendorsService.listProducts(user.userId);
  }

  @Post('vendor/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  createProduct(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateProductDto) {
    return this.vendorsService.createProduct(user.userId, body);
  }

  @Patch('vendor/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  updateProduct(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: UpdateProductDto
  ) {
    return this.vendorsService.updateProduct(user.userId, id, body);
  }

  @Delete('vendor/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  deleteProduct(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.vendorsService.deleteProduct(user.userId, id);
  }

  @Post('vendor/products/:id/variants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  addVariant(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: CreateVariantDto
  ) {
    return this.vendorsService.addVariant(user.userId, id, body);
  }

  @Patch('vendor/products/:id/variants/:variantId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  updateVariant(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() body: UpdateVariantDto
  ) {
    return this.vendorsService.updateVariant(user.userId, id, variantId, body);
  }

  @Delete('vendor/products/:id/variants/:variantId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  deleteVariant(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('variantId') variantId: string
  ) {
    return this.vendorsService.deleteVariant(user.userId, id, variantId);
  }

  @Post('vendor/products/:id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  addImages(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: AddProductImagesDto
  ) {
    return this.vendorsService.addImages(user.userId, id, body);
  }
}
