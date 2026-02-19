import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestLike } from '../common/http.types';
import { PaymentsService } from './payments.service';
import { StripeCheckoutDto } from './dto/stripe-checkout.dto';
import { MockPaymentWebhookDto } from './dto/mock-payment-webhook.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('stripe/checkout')
  @UseGuards(JwtAuthGuard)
  stripeCheckout(@CurrentUser() user: CurrentUserPayload, @Body() body: StripeCheckoutDto) {
    return this.paymentsService.stripeCheckout(user.userId, body);
  }

  @Post('wave/checkout')
  @UseGuards(JwtAuthGuard)
  waveCheckout(@CurrentUser() user: CurrentUserPayload, @Body() body: StripeCheckoutDto) {
    return this.paymentsService.waveCheckout(user.userId, body);
  }

  @Post('kbzpay/checkout')
  @UseGuards(JwtAuthGuard)
  kbzCheckout(@CurrentUser() user: CurrentUserPayload, @Body() body: StripeCheckoutDto) {
    return this.paymentsService.kbzCheckout(user.userId, body);
  }

  @Post('stripe/webhook')
  stripeWebhook(@Req() req: RequestLike) {
    return this.paymentsService.handleStripeWebhook(req);
  }

  @Post('wave/mock/webhook')
  waveMockWebhook(@Body() body: MockPaymentWebhookDto) {
    return this.paymentsService.handleWaveMockWebhook(body);
  }

  @Post('kbzpay/mock/webhook')
  kbzpayMockWebhook(@Body() body: MockPaymentWebhookDto) {
    return this.paymentsService.handleKbzpayMockWebhook(body);
  }
}
