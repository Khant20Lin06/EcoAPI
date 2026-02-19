"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSwaggerDocument = buildSwaggerDocument;
const swagger_1 = require("@nestjs/swagger");
function buildSwaggerDocument(app) {
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Eco System Order API')
        .setDescription('API documentation for Eco System Order App')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build();
    return swagger_1.SwaggerModule.createDocument(app, config);
}
