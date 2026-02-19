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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeAuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
let RealtimeAuthService = class RealtimeAuthService {
    jwtService;
    constructor(jwtService) {
        this.jwtService = jwtService;
    }
    authenticate(client) {
        const token = this.extractToken(client);
        if (!token) {
            throw new common_1.UnauthorizedException('Missing socket token');
        }
        const payload = this.jwtService.verify(token);
        if (!payload?.sub || !payload.role) {
            throw new common_1.UnauthorizedException('Invalid socket token');
        }
        return { userId: payload.sub, role: payload.role };
    }
    extractToken(client) {
        const authToken = client.handshake.auth?.token;
        if (typeof authToken === 'string' && authToken.length > 0) {
            return authToken;
        }
        const authHeader = client.handshake.headers.authorization;
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
            return authHeader.slice(7).trim();
        }
        return undefined;
    }
};
exports.RealtimeAuthService = RealtimeAuthService;
exports.RealtimeAuthService = RealtimeAuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService])
], RealtimeAuthService);
