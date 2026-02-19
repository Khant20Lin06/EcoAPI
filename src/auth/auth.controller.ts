import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestLike, ResponseLike } from '../common/http.types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  login(
    @Body() body: LoginDto,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    return this.authService.login(body, req, res);
  }

  @Post('refresh')
  refresh(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    return this.authService.refresh(req, res);
  }

  @Post('logout')
  logout(
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    return this.authService.logout(req, res);
  }

  @Post('verify-email')
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body);
  }

  @Post('resend-verification')
  resend(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerification(body);
  }
}
