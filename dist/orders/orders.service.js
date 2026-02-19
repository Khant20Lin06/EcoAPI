"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
let OrdersService = class OrdersService {
    create(userId, payload) {
        void userId;
        void payload;
        throw new Error('OrdersService provider should be mapped to OrdersDomainService');
    }
    list(userId, query) {
        void userId;
        void query;
        throw new Error('OrdersService provider should be mapped to OrdersDomainService');
    }
    get(userId, id) {
        void userId;
        void id;
        throw new Error('OrdersService provider should be mapped to OrdersDomainService');
    }
    listVendor(userId, query) {
        void userId;
        void query;
        throw new Error('OrdersService provider should be mapped to OrdersDomainService');
    }
    getVendor(userId, id) {
        void userId;
        void id;
        throw new Error('OrdersService provider should be mapped to OrdersDomainService');
    }
    listAdmin(query) {
        void query;
        throw new Error('OrdersService provider should be mapped to OrdersDomainService');
    }
    getAdmin(id) {
        void id;
        throw new Error('OrdersService provider should be mapped to OrdersDomainService');
    }
    updateStatus(userId, role, id, payload) {
        void userId;
        void role;
        void id;
        void payload;
        throw new Error('OrdersService provider should be mapped to OrdersDomainService');
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)()
], OrdersService);
