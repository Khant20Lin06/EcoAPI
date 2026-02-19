import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { Socket } from 'socket.io';
import { RealtimeUser } from './realtime.types';

interface AccessTokenPayload {
  sub: string;
  role: Role;
}

@Injectable()
export class RealtimeAuthService {
  constructor(private readonly jwtService: JwtService) {}

  authenticate(client: Socket): RealtimeUser {
    const token = this.extractToken(client);
    if (!token) {
      throw new UnauthorizedException('Missing socket token');
    }

    const payload = this.jwtService.verify<AccessTokenPayload>(token);
    if (!payload?.sub || !payload.role) {
      throw new UnauthorizedException('Invalid socket token');
    }

    return { userId: payload.sub, role: payload.role };
  }

  private extractToken(client: Socket) {
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
}
