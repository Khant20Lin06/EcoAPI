"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimePublisher = void 0;
const common_1 = require("@nestjs/common");
let RealtimePublisher = class RealtimePublisher {
    server;
    bind(server) {
        this.server = server;
    }
    emitToUser(userId, event, payload) {
        this.server?.to(this.userRoom(userId)).emit(event, payload);
    }
    emitToUsers(userIds, event, payload) {
        const uniqueUserIds = Array.from(new Set(userIds));
        for (const userId of uniqueUserIds) {
            this.emitToUser(userId, event, payload);
        }
    }
    emitToOrder(orderId, event, payload) {
        this.server?.to(this.orderRoom(orderId)).emit(event, payload);
    }
    userRoom(userId) {
        return `user:${userId}`;
    }
    orderRoom(orderId) {
        return `order:${orderId}`;
    }
};
exports.RealtimePublisher = RealtimePublisher;
exports.RealtimePublisher = RealtimePublisher = __decorate([
    (0, common_1.Injectable)()
], RealtimePublisher);
