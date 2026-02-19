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
exports.VendorsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const vendors_service_1 = require("./vendors.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const apply_vendor_dto_1 = require("./dto/apply-vendor.dto");
const create_product_dto_1 = require("./dto/create-product.dto");
const update_product_dto_1 = require("./dto/update-product.dto");
const variant_dto_1 = require("./dto/variant.dto");
const product_image_dto_1 = require("./dto/product-image.dto");
let VendorsController = class VendorsController {
    vendorsService;
    constructor(vendorsService) {
        this.vendorsService = vendorsService;
    }
    apply(user, body) {
        return this.vendorsService.apply(user.userId, body);
    }
    listProducts(user) {
        return this.vendorsService.listProducts(user.userId);
    }
    createProduct(user, body) {
        return this.vendorsService.createProduct(user.userId, body);
    }
    updateProduct(user, id, body) {
        return this.vendorsService.updateProduct(user.userId, id, body);
    }
    addVariant(user, id, body) {
        return this.vendorsService.addVariant(user.userId, id, body);
    }
    updateVariant(user, id, variantId, body) {
        return this.vendorsService.updateVariant(user.userId, id, variantId, body);
    }
    addImages(user, id, body) {
        return this.vendorsService.addImages(user.userId, id, body);
    }
};
exports.VendorsController = VendorsController;
__decorate([
    (0, common_1.Post)('vendors/apply'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.VENDOR),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, apply_vendor_dto_1.ApplyVendorDto]),
    __metadata("design:returntype", void 0)
], VendorsController.prototype, "apply", null);
__decorate([
    (0, common_1.Get)('vendor/products'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.VENDOR),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], VendorsController.prototype, "listProducts", null);
__decorate([
    (0, common_1.Post)('vendor/products'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.VENDOR),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_product_dto_1.CreateProductDto]),
    __metadata("design:returntype", void 0)
], VendorsController.prototype, "createProduct", null);
__decorate([
    (0, common_1.Patch)('vendor/products/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.VENDOR),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_product_dto_1.UpdateProductDto]),
    __metadata("design:returntype", void 0)
], VendorsController.prototype, "updateProduct", null);
__decorate([
    (0, common_1.Post)('vendor/products/:id/variants'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.VENDOR),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, variant_dto_1.CreateVariantDto]),
    __metadata("design:returntype", void 0)
], VendorsController.prototype, "addVariant", null);
__decorate([
    (0, common_1.Patch)('vendor/products/:id/variants/:variantId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.VENDOR),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('variantId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, variant_dto_1.UpdateVariantDto]),
    __metadata("design:returntype", void 0)
], VendorsController.prototype, "updateVariant", null);
__decorate([
    (0, common_1.Post)('vendor/products/:id/images'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.VENDOR),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, product_image_dto_1.AddProductImagesDto]),
    __metadata("design:returntype", void 0)
], VendorsController.prototype, "addImages", null);
exports.VendorsController = VendorsController = __decorate([
    (0, swagger_1.ApiTags)('vendor'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [vendors_service_1.VendorsService])
], VendorsController);
