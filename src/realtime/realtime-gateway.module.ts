import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeModule } from './realtime.module';

@Module({
  imports: [RealtimeModule, NotificationsModule, ChatModule],
  providers: [RealtimeGateway],
})
export class RealtimeGatewayModule {}
