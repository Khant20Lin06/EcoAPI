import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ListAdminReturnsQueryDto } from './dto/list-admin-returns-query.dto';
import { ListVendorReturnsQueryDto } from './dto/list-vendor-returns-query.dto';
import { ReturnsService } from './returns.service';

@ApiTags('vendor-returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@Controller('vendor/returns')
export class VendorReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload, @Query() query: ListVendorReturnsQueryDto) {
    return this.returnsService.listVendor(user.userId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.returnsService.getVendor(user.userId, id);
  }
}

@ApiTags('admin-returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/returns')
export class AdminReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  list(@Query() query: ListAdminReturnsQueryDto) {
    return this.returnsService.listAdmin(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.returnsService.getAdmin(id);
  }
}
