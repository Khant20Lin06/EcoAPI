import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateOrderDto) {
    return this.ordersService.create(user.userId, body);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: CurrentUserPayload, @Query() query: ListOrdersQueryDto) {
    return this.ordersService.list(user.userId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.ordersService.get(user.userId, id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto
  ) {
    return this.ordersService.updateStatus(user.userId, user.role, id, body);
  }
}
