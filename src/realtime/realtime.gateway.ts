import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { HttpException, Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimePublisher } from './realtime.publisher';
import { RealtimeUser } from './realtime.types';

const wsCorsRules = process.env.WS_CORS_ORIGIN
  ? process.env.WS_CORS_ORIGIN.split(',').map((item) => item.trim()).filter(Boolean)
  : null;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesOrigin(origin: string, rule: string) {
  if (rule === '*') {
    return true;
  }
  if (!rule.includes('*')) {
    return origin === rule;
  }
  const pattern = `^${rule.split('*').map(escapeRegex).join('.*')}$`;
  return new RegExp(pattern).test(origin);
}

function isWsOriginAllowed(origin?: string) {
  if (!wsCorsRules || !origin) {
    return true;
  }
  return wsCorsRules.some((rule) => matchesOrigin(origin, rule));
}

const wsCorsOrigin = (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
  if (isWsOriginAllowed(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`CORS blocked for origin: ${origin}`), false);
};

@Injectable()
@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: wsCorsOrigin,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly realtimeAuth: RealtimeAuthService,
    private readonly realtimePublisher: RealtimePublisher,
    private readonly chatService: ChatService,
    private readonly notificationsService: NotificationsService,
  ) {}

  afterInit() {
    this.realtimePublisher.bind(this.server);
  }

  handleConnection(client: Socket) {
    try {
      const user = this.realtimeAuth.authenticate(client);
      client.data.user = user;
      client.join(this.realtimePublisher.userRoom(user.userId));
    } catch {
      client.emit('error', { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('chat:subscribe')
  async subscribeToOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId?: string },
  ) {
    return this.execute(async () => {
      const user = this.requireUser(client);
      if (!body?.orderId) {
        throw new WsException('orderId is required');
      }

      await this.chatService.assertOrderAccess(user.userId, body.orderId);
      client.join(this.realtimePublisher.orderRoom(body.orderId));

      return { ok: true, orderId: body.orderId };
    });
  }

  @SubscribeMessage('chat:send')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { orderId?: string; body?: string; clientMessageId?: string },
  ) {
    return this.execute(async () => {
      const user = this.requireUser(client);
      if (!body?.orderId || typeof body.body !== 'string') {
        throw new WsException('orderId and body are required');
      }

      return this.chatService.sendMessage(user.userId, body.orderId, {
        body: body.body,
        clientMessageId: body.clientMessageId,
      });
    });
  }

  @SubscribeMessage('chat:mark-read')
  async markChatRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId?: string; messageId?: string },
  ) {
    return this.execute(async () => {
      const user = this.requireUser(client);
      if (!body?.orderId) {
        throw new WsException('orderId is required');
      }
      return this.chatService.markRead(user.userId, body.orderId, body.messageId);
    });
  }

  @SubscribeMessage('notifications:mark-read')
  async markNotificationRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { notificationId?: string },
  ) {
    return this.execute(async () => {
      const user = this.requireUser(client);
      if (!body?.notificationId) {
        throw new WsException('notificationId is required');
      }
      return this.notificationsService.markRead(user.userId, body.notificationId);
    });
  }

  @SubscribeMessage('notifications:mark-all-read')
  async markAllNotificationRead(@ConnectedSocket() client: Socket) {
    return this.execute(async () => {
      const user = this.requireUser(client);
      return this.notificationsService.markAllRead(user.userId);
    });
  }

  private requireUser(client: Socket) {
    const user = client.data.user as RealtimeUser | undefined;
    if (!user?.userId) {
      throw new WsException('Unauthorized');
    }
    return user;
  }

  private async execute<T>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof WsException) {
        throw error;
      }

      if (error instanceof HttpException) {
        throw new WsException(error.message);
      }

      throw new WsException('Internal server error');
    }
  }
}
