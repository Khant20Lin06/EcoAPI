import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Delete } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Role } from '@prisma/client';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateShippingRateAdminDto } from './dto/update-shipping-rate-admin.dto';
import { CreateVendorAdminDto } from './dto/create-vendor-admin.dto';
import { UpdateVendorAdminDto } from './dto/update-vendor-admin.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('vendors')
  listVendors() {
    return this.adminService.listVendors();
  }

  @Get('vendors/:id')
  getVendor(@Param('id') id: string) {
    return this.adminService.getVendor(id);
  }

  @Post('vendors')
  createVendor(@Body() body: CreateVendorAdminDto) {
    return this.adminService.createVendor(body);
  }

  @Patch('vendors/:id')
  updateVendor(@Param('id') id: string, @Body() body: UpdateVendorAdminDto) {
    return this.adminService.updateVendor(id, body);
  }

  @Patch('vendors/:id/approve')
  approveVendor(@Param('id') id: string) {
    return this.adminService.approveVendor(id);
  }

  @Delete('vendors/:id')
  suspendVendor(@Param('id') id: string) {
    return this.adminService.suspendVendor(id);
  }

  @Post('tags')
  createTag(@Body() body: CreateTagDto) {
    return this.adminService.createTag(body);
  }

  @Patch('tags/:id')
  updateTag(@Param('id') id: string, @Body() body: UpdateTagDto) {
    return this.adminService.updateTag(id, body);
  }

  @Post('categories')
  createCategory(@Body() body: CreateCategoryDto) {
    return this.adminService.createCategory(body);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: UpdateCategoryDto) {
    return this.adminService.updateCategory(id, body);
  }

  @Patch('shipping/rates/:id')
  updateShippingRate(
    @Param('id') id: string,
    @Body() body: UpdateShippingRateAdminDto
  ) {
    return this.adminService.updateShippingRateStatus(id, body.active);
  }
}
