"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const swagger_1 = require("@nestjs/swagger");
const body_parser_1 = require("body-parser");
const swagger_2 = require("./swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api/v1');
    app.use('/api/v1/payments/stripe/webhook', (0, body_parser_1.raw)({ type: 'application/json' }));
    app.use((0, cookie_parser_1.default)());
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false
    }));
    const document = (0, swagger_2.buildSwaggerDocument)(app);
    swagger_1.SwaggerModule.setup('docs', app, document);
    const port = process.env.PORT ? Number(process.env.PORT) : 3001;
    await app.listen(port);
    // eslint-disable-next-line no-console
    console.log(`API listening on ${port}`);
}
bootstrap();
