import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimePublisher } from './realtime.publisher';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  providers: [RealtimeAuthService, RealtimePublisher],
  exports: [RealtimeAuthService, RealtimePublisher],
})
export class RealtimeModule {}
