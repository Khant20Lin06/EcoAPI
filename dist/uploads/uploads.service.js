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
exports.UploadsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
let UploadsService = class UploadsService {
    config;
    s3;
    bucket;
    constructor(config) {
        this.config = config;
        const endpoint = this.config.get('S3_ENDPOINT');
        const region = this.config.get('S3_REGION') ?? 'us-east-1';
        const accessKeyId = this.config.get('S3_ACCESS_KEY');
        const secretAccessKey = this.config.get('S3_SECRET_KEY');
        this.bucket = this.config.get('S3_BUCKET') ?? 'uploads';
        this.s3 = new client_s3_1.S3Client({
            region,
            endpoint: endpoint || undefined,
            forcePathStyle: Boolean(endpoint),
            credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
        });
    }
    async presign(payload, userId) {
        const maxBytes = Number(this.config.get('UPLOAD_MAX_BYTES') ?? 5 * 1024 * 1024);
        if (payload.size > maxBytes) {
            throw new common_1.BadRequestException('File too large');
        }
        const allowedTypes = (this.config.get('UPLOAD_ALLOWED_TYPES') ??
            'image/jpeg,image/png,image/webp').split(',');
        if (!allowedTypes.includes(payload.contentType)) {
            throw new common_1.BadRequestException('Unsupported file type');
        }
        const safeName = payload.filename.replace(/[^a-zA-Z0-9._-]/g, '');
        const prefix = userId ? `uploads/${userId}` : 'uploads/public';
        const key = `${prefix}/${Date.now()}-${safeName}`;
        const command = new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: payload.contentType
        });
        const expiresIn = 60 * 5;
        const url = await (0, s3_request_presigner_1.getSignedUrl)(this.s3, command, { expiresIn });
        return { url, key, bucket: this.bucket, expiresIn };
    }
};
exports.UploadsService = UploadsService;
exports.UploadsService = UploadsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], UploadsService);
