import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ListVendorOrdersQueryDto } from './dto/list-vendor-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class OrdersService {
  create(userId: string, payload: CreateOrderDto) {
    void userId;
    void payload;
    throw new Error('OrdersService provider should be mapped to OrdersDomainService');
  }

  list(userId: string, query: ListOrdersQueryDto) {
    void userId;
    void query;
    throw new Error('OrdersService provider should be mapped to OrdersDomainService');
  }

  get(userId: string, id: string) {
    void userId;
    void id;
    throw new Error('OrdersService provider should be mapped to OrdersDomainService');
  }

  listVendor(userId: string, query: ListVendorOrdersQueryDto) {
    void userId;
    void query;
    throw new Error('OrdersService provider should be mapped to OrdersDomainService');
  }

  getVendor(userId: string, id: string) {
    void userId;
    void id;
    throw new Error('OrdersService provider should be mapped to OrdersDomainService');
  }

  listAdmin(query: ListAdminOrdersQueryDto) {
    void query;
    throw new Error('OrdersService provider should be mapped to OrdersDomainService');
  }

  getAdmin(id: string) {
    void id;
    throw new Error('OrdersService provider should be mapped to OrdersDomainService');
  }

  updateStatus(
    userId: string,
    role: Role,
    id: string,
    payload: UpdateOrderStatusDto,
  ) {
    void userId;
    void role;
    void id;
    void payload;
    throw new Error('OrdersService provider should be mapped to OrdersDomainService');
  }
}
