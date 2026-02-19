"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const chat_service_1 = require("./chat.service");
const list_chat_messages_query_dto_1 = require("./dto/list-chat-messages-query.dto");
const list_chat_threads_query_dto_1 = require("./dto/list-chat-threads-query.dto");
const mark_chat_read_dto_1 = require("./dto/mark-chat-read.dto");
const send_chat_message_dto_1 = require("./dto/send-chat-message.dto");
let ChatController = class ChatController {
    chatService;
    constructor(chatService) {
        this.chatService = chatService;
    }
    listThreads(user, query) {
        return this.chatService.listThreads(user.userId, query);
    }
    listMessages(user, orderId, query) {
        return this.chatService.listMessages(user.userId, orderId, query);
    }
    sendMessage(user, orderId, body) {
        return this.chatService.sendMessage(user.userId, orderId, {
            body: body.body,
        });
    }
    markRead(user, orderId, body) {
        return this.chatService.markRead(user.userId, orderId, body.messageId);
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Get)('threads'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, list_chat_threads_query_dto_1.ListChatThreadsQueryDto]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listThreads", null);
__decorate([
    (0, common_1.Get)('threads/:orderId/messages'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('orderId')),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, list_chat_messages_query_dto_1.ListChatMessagesQueryDto]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listMessages", null);
__decorate([
    (0, common_1.Post)('threads/:orderId/messages'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('orderId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, send_chat_message_dto_1.SendChatMessageDto]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "sendMessage", null);
__decorate([
    (0, common_1.Patch)('threads/:orderId/read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('orderId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, mark_chat_read_dto_1.MarkChatReadDto]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "markRead", null);
exports.ChatController = ChatController = __decorate([
    (0, swagger_1.ApiTags)('chat'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('chat'),
    __metadata("design:paramtypes", [chat_service_1.ChatService])
], ChatController);
