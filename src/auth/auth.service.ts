import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { RequestLike, ResponseLike } from '../common/http.types';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

const HOURS_24 = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const role = dto.role ?? Role.CUSTOMER;
    if (role === Role.ADMIN) {
      throw new BadRequestException('Admin role not allowed');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
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

  async login(dto: LoginDto, req: RequestLike, res: ResponseLike) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
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

  async refresh(req: RequestLike, res: ResponseLike) {
    const token = this.getRefreshTokenFromReq(req);
    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
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
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() }
    });

    const user = await this.prisma.user.findUnique({ where: { id: existing.userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { accessToken, refreshToken, refreshExpiresAt } = await this.issueTokens(user, req);
    this.setRefreshCookie(res, refreshToken, refreshExpiresAt);
    res.setHeader('Authorization', `Bearer ${accessToken}`);

    return { accessToken };
  }

  async logout(req: RequestLike, res: ResponseLike) {
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

  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() }
      }
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired token');
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

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.emailVerifiedAt) {
      return { ok: true };
    }

    const token = await this.createEmailVerificationToken(user.id);
    return this.attachDevToken({ ok: true }, token);
  }

  private async issueTokens(user: { id: string; role: Role }, req: RequestLike) {
    const accessToken = this.jwtService.sign({ sub: user.id, role: user.role });
    const { token: refreshToken, expiresAt: refreshExpiresAt } = await this.createRefreshToken(
      user.id,
      req
    );

    return { accessToken, refreshToken, refreshExpiresAt };
  }

  private async createRefreshToken(userId: string, req: RequestLike) {
    const token = randomBytes(64).toString('hex');
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

  private async createEmailVerificationToken(userId: string) {
    const token = randomBytes(32).toString('hex');
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

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTtlDays() {
    return Number(this.config.get('JWT_REFRESH_EXPIRES_DAYS') ?? 30);
  }

  private refreshCookieName() {
    return this.config.get<string>('COOKIE_REFRESH_NAME') ?? 'refresh_token';
  }

  private cookieOptions(maxAgeMs: number) {
    const sameSiteRaw = (this.config.get<string>('COOKIE_SAMESITE') ?? 'lax').toLowerCase();
    const sameSite = ['lax', 'strict', 'none'].includes(sameSiteRaw)
      ? (sameSiteRaw as 'lax' | 'strict' | 'none')
      : 'lax';
    const secureEnv = this.config.get<string>('COOKIE_SECURE');
    const secure =
      secureEnv === 'true' ||
      secureEnv === '1' ||
      this.config.get<string>('NODE_ENV') === 'production';

    const domain = this.config.get<string>('COOKIE_DOMAIN') || undefined;
    const path = this.config.get<string>('COOKIE_PATH') ?? '/';

    return {
      httpOnly: true,
      sameSite,
      secure,
      domain,
      path,
      maxAge: maxAgeMs
    };
  }

  private setRefreshCookie(res: ResponseLike, token: string, expiresAt: Date) {
    const maxAge = expiresAt.getTime() - Date.now();
    res.cookie(this.refreshCookieName(), token, this.cookieOptions(maxAge));
  }

  private clearRefreshCookie(res: ResponseLike) {
    res.clearCookie(this.refreshCookieName(), this.cookieOptions(0));
  }

  private getRefreshTokenFromReq(req: RequestLike) {
    const cookieName = this.refreshCookieName();
    return req.cookies?.[cookieName] as string | undefined;
  }

  private attachDevToken<T extends Record<string, unknown>>(payload: T, token: string) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      return payload;
    }

    return { ...payload, verifyToken: token };
  }
}
