import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ListChatMessagesQueryDto } from './dto/list-chat-messages-query.dto';
import { ListChatThreadsQueryDto } from './dto/list-chat-threads-query.dto';
import { MarkChatReadDto } from './dto/mark-chat-read.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('threads')
  listThreads(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListChatThreadsQueryDto,
  ) {
    return this.chatService.listThreads(user.userId, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.chatService.getUnreadCount(user.userId);
  }

  @Get('threads/:orderId/messages')
  listMessages(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId') orderId: string,
    @Query() query: ListChatMessagesQueryDto,
  ) {
    return this.chatService.listMessages(user.userId, orderId, query);
  }

  @Post('threads/:orderId/messages')
  sendMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId') orderId: string,
    @Body() body: SendChatMessageDto,
  ) {
    return this.chatService.sendMessage(user.userId, orderId, {
      body: body.body,
    });
  }

  @Patch('threads/:orderId/read')
  markRead(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId') orderId: string,
    @Body() body: MarkChatReadDto,
  ) {
    return this.chatService.markRead(user.userId, orderId, body.messageId);
  }
}
