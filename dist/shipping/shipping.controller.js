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
exports.ShippingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const create_pickup_location_dto_1 = require("./dto/create-pickup-location.dto");
const list_pickup_locations_dto_1 = require("./dto/list-pickup-locations.dto");
const list_rates_dto_1 = require("./dto/list-rates.dto");
const shipping_service_1 = require("./shipping.service");
let ShippingController = class ShippingController {
    shippingService;
    constructor(shippingService) {
        this.shippingService = shippingService;
    }
    listRates(query) {
        return this.shippingService.listRates(query);
    }
    listPickupLocations(user, query) {
        return this.shippingService.listPickupLocations(query, user);
    }
    createPickupLocation(user, dto) {
        return this.shippingService.createPickupLocation(user.userId, dto);
    }
};
exports.ShippingController = ShippingController;
__decorate([
    (0, common_1.Get)('rates'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_rates_dto_1.ListShippingRatesQueryDto]),
    __metadata("design:returntype", void 0)
], ShippingController.prototype, "listRates", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('pickup-locations'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, list_pickup_locations_dto_1.ListPickupLocationsQueryDto]),
    __metadata("design:returntype", void 0)
], ShippingController.prototype, "listPickupLocations", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.VENDOR),
    (0, common_1.Post)('pickup-locations'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_pickup_location_dto_1.CreatePickupLocationDto]),
    __metadata("design:returntype", void 0)
], ShippingController.prototype, "createPickupLocation", null);
exports.ShippingController = ShippingController = __decorate([
    (0, swagger_1.ApiTags)('shipping'),
    (0, common_1.Controller)('shipping'),
    __metadata("design:paramtypes", [shipping_service_1.ShippingService])
], ShippingController);
