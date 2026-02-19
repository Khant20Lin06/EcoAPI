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
exports.VendorShippingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const create_shipping_rate_dto_1 = require("./dto/create-shipping-rate.dto");
const list_vendor_shipping_rates_query_dto_1 = require("./dto/list-vendor-shipping-rates-query.dto");
const update_shipping_rate_dto_1 = require("./dto/update-shipping-rate.dto");
const shipping_service_1 = require("./shipping.service");
let VendorShippingController = class VendorShippingController {
    shippingService;
    constructor(shippingService) {
        this.shippingService = shippingService;
    }
    listRates(user, query) {
        return this.shippingService.listVendorRates(user.userId, query);
    }
    createRate(user, body) {
        return this.shippingService.createVendorRate(user.userId, body);
    }
    updateRate(user, id, body) {
        return this.shippingService.updateVendorRate(user.userId, id, body);
    }
    disableRate(user, id) {
        return this.shippingService.disableVendorRate(user.userId, id);
    }
};
exports.VendorShippingController = VendorShippingController;
__decorate([
    (0, common_1.Get)('rates'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, list_vendor_shipping_rates_query_dto_1.ListVendorShippingRatesQueryDto]),
    __metadata("design:returntype", void 0)
], VendorShippingController.prototype, "listRates", null);
__decorate([
    (0, common_1.Post)('rates'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_shipping_rate_dto_1.CreateShippingRateDto]),
    __metadata("design:returntype", void 0)
], VendorShippingController.prototype, "createRate", null);
__decorate([
    (0, common_1.Patch)('rates/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_shipping_rate_dto_1.UpdateShippingRateDto]),
    __metadata("design:returntype", void 0)
], VendorShippingController.prototype, "updateRate", null);
__decorate([
    (0, common_1.Delete)('rates/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], VendorShippingController.prototype, "disableRate", null);
exports.VendorShippingController = VendorShippingController = __decorate([
    (0, swagger_1.ApiTags)('vendor-shipping'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.VENDOR),
    (0, common_1.Controller)('vendor/shipping'),
    __metadata("design:paramtypes", [shipping_service_1.ShippingService])
], VendorShippingController);
