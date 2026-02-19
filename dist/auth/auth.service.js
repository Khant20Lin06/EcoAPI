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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const HOURS_24 = 24 * 60 * 60 * 1000;
let AuthService = class AuthService {
    prisma;
    jwtService;
    config;
    constructor(prisma, jwtService, config) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.config = config;
    }
    async register(dto) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing) {
            throw new common_1.ConflictException('Email already in use');
        }
        const role = dto.role ?? client_1.Role.CUSTOMER;
        if (role === client_1.Role.ADMIN) {
            throw new common_1.BadRequestException('Admin role not allowed');
        }
        const passwordHash = await bcryptjs_1.default.hash(dto.password, 10);
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                passwordHash,
                role,
                locale: dto.locale ?? 'en'
            }
        });
        const token = await this.createEmailVerificationToken(user.id);
        return this.attachDevToken({ ok: true, userId: user.id }, token);
    }
    async login(dto, req, res) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const valid = await bcryptjs_1.default.compare(dto.password, user.passwordHash);
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const { accessToken, refreshToken, refreshExpiresAt } = await this.issueTokens(user, req);
        this.setRefreshCookie(res, refreshToken, refreshExpiresAt);
        res.setHeader('Authorization', `Bearer ${accessToken}`);
        return {
            accessToken,
            user: {
                id: user.id,
                role: user.role,
                email: user.email,
                locale: user.locale,
                emailVerifiedAt: user.emailVerifiedAt
            }
        };
    }
    async refresh(req, res) {
        const token = this.getRefreshTokenFromReq(req);
        if (!token) {
            throw new common_1.UnauthorizedException('Missing refresh token');
        }
        const tokenHash = this.hashToken(token);
        const existing = await this.prisma.refreshToken.findFirst({
            where: {
                tokenHash,
                revokedAt: null,
                expiresAt: { gt: new Date() }
            }
        });
        if (!existing) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        await this.prisma.refreshToken.update({
            where: { id: existing.id },
            data: { revokedAt: new Date() }
        });
        const user = await this.prisma.user.findUnique({ where: { id: existing.userId } });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found');
        }
        const { accessToken, refreshToken, refreshExpiresAt } = await this.issueTokens(user, req);
        this.setRefreshCookie(res, refreshToken, refreshExpiresAt);
        res.setHeader('Authorization', `Bearer ${accessToken}`);
        return { accessToken };
    }
    async logout(req, res) {
        const token = this.getRefreshTokenFromReq(req);
        if (token) {
            const tokenHash = this.hashToken(token);
            await this.prisma.refreshToken.updateMany({
                where: { tokenHash, revokedAt: null },
                data: { revokedAt: new Date() }
            });
        }
        this.clearRefreshCookie(res);
        return { ok: true };
    }
    async verifyEmail(dto) {
        const tokenHash = this.hashToken(dto.token);
        const record = await this.prisma.emailVerificationToken.findFirst({
            where: {
                tokenHash,
                usedAt: null,
                expiresAt: { gt: new Date() }
            }
        });
        if (!record) {
            throw new common_1.BadRequestException('Invalid or expired token');
        }
        await this.prisma.emailVerificationToken.update({
            where: { id: record.id },
            data: { usedAt: new Date() }
        });
        await this.prisma.user.update({
            where: { id: record.userId },
            data: { emailVerifiedAt: new Date() }
        });
        return { ok: true };
    }
    async resendVerification(dto) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user || user.emailVerifiedAt) {
            return { ok: true };
        }
        const token = await this.createEmailVerificationToken(user.id);
        return this.attachDevToken({ ok: true }, token);
    }
    async issueTokens(user, req) {
        const accessToken = this.jwtService.sign({ sub: user.id, role: user.role });
        const { token: refreshToken, expiresAt: refreshExpiresAt } = await this.createRefreshToken(user.id, req);
        return { accessToken, refreshToken, refreshExpiresAt };
    }
    async createRefreshToken(userId, req) {
        const token = (0, crypto_1.randomBytes)(64).toString('hex');
        const tokenHash = this.hashToken(token);
        const expiresAt = new Date(Date.now() + this.refreshTtlDays() * 24 * 60 * 60 * 1000);
        const headerValue = req.headers['user-agent'];
        const userAgent = Array.isArray(headerValue)
            ? headerValue.join('; ')
            : headerValue;
        await this.prisma.refreshToken.create({
            data: {
                userId,
                tokenHash,
                expiresAt,
                userAgent,
                ip: req.ip
            }
        });
        return { token, expiresAt };
    }
    async createEmailVerificationToken(userId) {
        const token = (0, crypto_1.randomBytes)(32).toString('hex');
        const tokenHash = this.hashToken(token);
        const expiresAt = new Date(Date.now() + HOURS_24);
        await this.prisma.emailVerificationToken.create({
            data: {
                userId,
                tokenHash,
                expiresAt
            }
        });
        return token;
    }
    hashToken(token) {
        return (0, crypto_1.createHash)('sha256').update(token).digest('hex');
    }
    refreshTtlDays() {
        return Number(this.config.get('JWT_REFRESH_EXPIRES_DAYS') ?? 30);
    }
    refreshCookieName() {
        return this.config.get('COOKIE_REFRESH_NAME') ?? 'refresh_token';
    }
    cookieOptions(maxAgeMs) {
        const sameSiteRaw = (this.config.get('COOKIE_SAMESITE') ?? 'lax').toLowerCase();
        const sameSite = ['lax', 'strict', 'none'].includes(sameSiteRaw)
            ? sameSiteRaw
            : 'lax';
        const secureEnv = this.config.get('COOKIE_SECURE');
        const secure = secureEnv === 'true' ||
            secureEnv === '1' ||
            this.config.get('NODE_ENV') === 'production';
        const domain = this.config.get('COOKIE_DOMAIN') || undefined;
        const path = this.config.get('COOKIE_PATH') ?? '/';
        return {
            httpOnly: true,
            sameSite,
            secure,
            domain,
            path,
            maxAge: maxAgeMs
        };
    }
    setRefreshCookie(res, token, expiresAt) {
        const maxAge = expiresAt.getTime() - Date.now();
        res.cookie(this.refreshCookieName(), token, this.cookieOptions(maxAge));
    }
    clearRefreshCookie(res) {
        res.clearCookie(this.refreshCookieName(), this.cookieOptions(0));
    }
    getRefreshTokenFromReq(req) {
        const cookieName = this.refreshCookieName();
        return req.cookies?.[cookieName];
    }
    attachDevToken(payload, token) {
        if (this.config.get('NODE_ENV') === 'production') {
            return payload;
        }
        return { ...payload, verifyToken: token };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
