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
exports.AdminReturnsController = exports.VendorReturnsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const list_admin_returns_query_dto_1 = require("./dto/list-admin-returns-query.dto");
const list_vendor_returns_query_dto_1 = require("./dto/list-vendor-returns-query.dto");
const returns_service_1 = require("./returns.service");
let VendorReturnsController = class VendorReturnsController {
    returnsService;
    constructor(returnsService) {
        this.returnsService = returnsService;
    }
    list(user, query) {
        return this.returnsService.listVendor(user.userId, query);
    }
    get(user, id) {
        return this.returnsService.getVendor(user.userId, id);
    }
};
exports.VendorReturnsController = VendorReturnsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, list_vendor_returns_query_dto_1.ListVendorReturnsQueryDto]),
    __metadata("design:returntype", void 0)
], VendorReturnsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], VendorReturnsController.prototype, "get", null);
exports.VendorReturnsController = VendorReturnsController = __decorate([
    (0, swagger_1.ApiTags)('vendor-returns'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.VENDOR),
    (0, common_1.Controller)('vendor/returns'),
    __metadata("design:paramtypes", [returns_service_1.ReturnsService])
], VendorReturnsController);
let AdminReturnsController = class AdminReturnsController {
    returnsService;
    constructor(returnsService) {
        this.returnsService = returnsService;
    }
    list(query) {
        return this.returnsService.listAdmin(query);
    }
    get(id) {
        return this.returnsService.getAdmin(id);
    }
};
exports.AdminReturnsController = AdminReturnsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [list_admin_returns_query_dto_1.ListAdminReturnsQueryDto]),
    __metadata("design:returntype", void 0)
], AdminReturnsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminReturnsController.prototype, "get", null);
exports.AdminReturnsController = AdminReturnsController = __decorate([
    (0, swagger_1.ApiTags)('admin-returns'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    (0, common_1.Controller)('admin/returns'),
    __metadata("design:paramtypes", [returns_service_1.ReturnsService])
], AdminReturnsController);
