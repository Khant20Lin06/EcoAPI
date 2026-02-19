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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidatePromotionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class ValidatePromotionDto {
    code;
    orderTotal;
    vendorId;
}
exports.ValidatePromotionDto = ValidatePromotionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ECO10' }),
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value),
    __metadata("design:type", String)
], ValidatePromotionDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10000, description: 'Order total in smallest unit' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1_000_000_000),
    __metadata("design:type", Number)
], ValidatePromotionDto.prototype, "orderTotal", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Vendor id to validate vendor-specific promotions',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ValidatePromotionDto.prototype, "vendorId", void 0);
