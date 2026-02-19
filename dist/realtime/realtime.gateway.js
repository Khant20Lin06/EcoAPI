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
exports.RealtimeGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const chat_service_1 = require("../chat/chat.service");
const notifications_service_1 = require("../notifications/notifications.service");
const realtime_auth_service_1 = require("./realtime-auth.service");
const realtime_publisher_1 = require("./realtime.publisher");
const wsCorsOrigin = process.env.WS_CORS_ORIGIN
    ? process.env.WS_CORS_ORIGIN.split(',').map((item) => item.trim())
    : true;
let RealtimeGateway = class RealtimeGateway {
    realtimeAuth;
    realtimePublisher;
    chatService;
    notificationsService;
    server;
    constructor(realtimeAuth, realtimePublisher, chatService, notificationsService) {
        this.realtimeAuth = realtimeAuth;
        this.realtimePublisher = realtimePublisher;
        this.chatService = chatService;
        this.notificationsService = notificationsService;
    }
    afterInit() {
        this.realtimePublisher.bind(this.server);
    }
    handleConnection(client) {
        try {
            const user = this.realtimeAuth.authenticate(client);
            client.data.user = user;
            client.join(this.realtimePublisher.userRoom(user.userId));
        }
        catch {
            client.emit('error', { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            client.disconnect(true);
        }
    }
    async subscribeToOrder(client, body) {
        return this.execute(async () => {
            const user = this.requireUser(client);
            if (!body?.orderId) {
                throw new websockets_1.WsException('orderId is required');
            }
            await this.chatService.assertOrderAccess(user.userId, body.orderId);
            client.join(this.realtimePublisher.orderRoom(body.orderId));
            return { ok: true, orderId: body.orderId };
        });
    }
    async sendMessage(client, body) {
        return this.execute(async () => {
            const user = this.requireUser(client);
            if (!body?.orderId || typeof body.body !== 'string') {
                throw new websockets_1.WsException('orderId and body are required');
            }
            return this.chatService.sendMessage(user.userId, body.orderId, {
                body: body.body,
                clientMessageId: body.clientMessageId,
            });
        });
    }
    async markChatRead(client, body) {
        return this.execute(async () => {
            const user = this.requireUser(client);
            if (!body?.orderId) {
                throw new websockets_1.WsException('orderId is required');
            }
            return this.chatService.markRead(user.userId, body.orderId, body.messageId);
        });
    }
    async markNotificationRead(client, body) {
        return this.execute(async () => {
            const user = this.requireUser(client);
            if (!body?.notificationId) {
                throw new websockets_1.WsException('notificationId is required');
            }
            return this.notificationsService.markRead(user.userId, body.notificationId);
        });
    }
    async markAllNotificationRead(client) {
        return this.execute(async () => {
            const user = this.requireUser(client);
            return this.notificationsService.markAllRead(user.userId);
        });
    }
    requireUser(client) {
        const user = client.data.user;
        if (!user?.userId) {
            throw new websockets_1.WsException('Unauthorized');
        }
        return user;
    }
    async execute(run) {
        try {
            return await run();
        }
        catch (error) {
            if (error instanceof websockets_1.WsException) {
                throw error;
            }
            if (error instanceof common_1.HttpException) {
                throw new websockets_1.WsException(error.message);
            }
            throw new websockets_1.WsException('Internal server error');
        }
    }
};
exports.RealtimeGateway = RealtimeGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('chat:subscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "subscribeToOrder", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('chat:send'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "sendMessage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('chat:mark-read'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "markChatRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('notifications:mark-read'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "markNotificationRead", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('notifications:mark-all-read'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "markAllNotificationRead", null);
exports.RealtimeGateway = RealtimeGateway = __decorate([
    (0, common_1.Injectable)(),
    (0, websockets_1.WebSocketGateway)({
        namespace: '/ws',
        cors: {
            origin: wsCorsOrigin,
            credentials: true,
        },
    }),
    __metadata("design:paramtypes", [realtime_auth_service_1.RealtimeAuthService,
        realtime_publisher_1.RealtimePublisher,
        chat_service_1.ChatService,
        notifications_service_1.NotificationsService])
], RealtimeGateway);
