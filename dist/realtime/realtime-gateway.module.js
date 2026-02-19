"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeGatewayModule = void 0;
const common_1 = require("@nestjs/common");
const chat_module_1 = require("../chat/chat.module");
const notifications_module_1 = require("../notifications/notifications.module");
const realtime_gateway_1 = require("./realtime.gateway");
const realtime_module_1 = require("./realtime.module");
let RealtimeGatewayModule = class RealtimeGatewayModule {
};
exports.RealtimeGatewayModule = RealtimeGatewayModule;
exports.RealtimeGatewayModule = RealtimeGatewayModule = __decorate([
    (0, common_1.Module)({
        imports: [realtime_module_1.RealtimeModule, notifications_module_1.NotificationsModule, chat_module_1.ChatModule],
        providers: [realtime_gateway_1.RealtimeGateway],
    })
], RealtimeGatewayModule);
