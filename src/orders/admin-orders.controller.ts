import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { OrdersService } from './orders.service';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';

@ApiTags('admin-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@Query() query: ListAdminOrdersQueryDto) {
    return this.ordersService.listAdmin(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.ordersService.getAdmin(id);
  }
}
