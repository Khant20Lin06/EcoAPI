import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class RealtimePublisher {
  private server?: Server;

  bind(server: Server) {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(this.userRoom(userId)).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    const uniqueUserIds = Array.from(new Set(userIds));
    for (const userId of uniqueUserIds) {
      this.emitToUser(userId, event, payload);
    }
  }

  emitToOrder(orderId: string, event: string, payload: unknown) {
    this.server?.to(this.orderRoom(orderId)).emit(event, payload);
  }

  userRoom(userId: string) {
    return `user:${userId}`;
  }

  orderRoom(orderId: string) {
    return `order:${orderId}`;
  }
}
