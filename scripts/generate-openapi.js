const { NestFactory } = require('@nestjs/core');
const { writeFileSync } = require('fs');
const { join } = require('path');
const { AppModule } = require('../dist/app.module');
const { buildSwaggerDocument } = require('../dist/swagger');

async function generate() {
  const app = await NestFactory.create(AppModule);
  const document = buildSwaggerDocument(app);
  const outputPath = join(__dirname, '..', 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');
  await app.close();
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
