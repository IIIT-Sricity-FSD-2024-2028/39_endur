import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ─── CORS ────────────────────────────────────────────────────────
  // Allow all origins for now; restrict to your domain before deployment
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Accept,X-Role,X-User-Id,X-User-Name',
  });

  // ─── Global Validation Pipe ──────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // ─── Global API Prefix ───────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ─── Swagger ─────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('ENDUR API')
    .setDescription(
      `
      REST API for the **ENDUR Performance Review & Feedback Management System**.

      ## Role-Based Access Control
      All protected endpoints require the \`X-Role\` header with one of:
      \`superuser\` | \`admin\` | \`dean\` | \`hod\` | \`faculty\` | \`student\`

      Additionally, pass \`X-User-Id\` and \`X-User-Name\` headers to attribute audit logs correctly.

      ## Authentication
      Use \`POST /api/auth/login\` to verify credentials. The response contains the user object
      which you should store client-side (session) and use to populate role headers.
      `,
    )
    .setVersion('1.0')
    .addGlobalParameters({
      in: 'header',
      name: 'X-Role',
      required: false,
      schema: {
        type: 'string',
        enum: ['superuser', 'admin', 'dean', 'hod', 'faculty', 'student'],
      },
    })
    .addGlobalParameters({
      in: 'header',
      name: 'X-User-Id',
      required: false,
      schema: { type: 'string' },
    })
    .addGlobalParameters({
      in: 'header',
      name: 'X-User-Name',
      required: false,
      schema: { type: 'string' },
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Serve Swagger UI at /api/docs
  SwaggerModule.setup('api/docs', app, document);

  // Save swagger.json to docs folder
  const docsDir = path.join(__dirname, '..', 'docs');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'swagger.json'), JSON.stringify(document, null, 2));

  // ─── Start Server ────────────────────────────────────────────────
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`\n🚀 ENDUR API running at: http://localhost:${port}/api`);
  console.log(`📖 Swagger UI at:         http://localhost:${port}/api/docs\n`);
}

bootstrap();
