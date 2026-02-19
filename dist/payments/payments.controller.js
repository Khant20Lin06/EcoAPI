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
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const payments_service_1 = require("./payments.service");
const stripe_checkout_dto_1 = require("./dto/stripe-checkout.dto");
const mock_payment_webhook_dto_1 = require("./dto/mock-payment-webhook.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let PaymentsController = class PaymentsController {
    paymentsService;
    constructor(paymentsService) {
        this.paymentsService = paymentsService;
    }
    stripeCheckout(user, body) {
        return this.paymentsService.stripeCheckout(user.userId, body);
    }
    waveCheckout(user, body) {
        return this.paymentsService.waveCheckout(user.userId, body);
    }
    kbzCheckout(user, body) {
        return this.paymentsService.kbzCheckout(user.userId, body);
    }
    stripeWebhook(req) {
        return this.paymentsService.handleStripeWebhook(req);
    }
    waveMockWebhook(body) {
        return this.paymentsService.handleWaveMockWebhook(body);
    }
    kbzpayMockWebhook(body) {
        return this.paymentsService.handleKbzpayMockWebhook(body);
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Post)('stripe/checkout'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, stripe_checkout_dto_1.StripeCheckoutDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "stripeCheckout", null);
__decorate([
    (0, common_1.Post)('wave/checkout'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, stripe_checkout_dto_1.StripeCheckoutDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "waveCheckout", null);
__decorate([
    (0, common_1.Post)('kbzpay/checkout'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, stripe_checkout_dto_1.StripeCheckoutDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "kbzCheckout", null);
__decorate([
    (0, common_1.Post)('stripe/webhook'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "stripeWebhook", null);
__decorate([
    (0, common_1.Post)('wave/mock/webhook'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mock_payment_webhook_dto_1.MockPaymentWebhookDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "waveMockWebhook", null);
__decorate([
    (0, common_1.Post)('kbzpay/mock/webhook'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mock_payment_webhook_dto_1.MockPaymentWebhookDto]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "kbzpayMockWebhook", null);
exports.PaymentsController = PaymentsController = __decorate([
    (0, swagger_1.ApiTags)('payments'),
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], PaymentsController);
