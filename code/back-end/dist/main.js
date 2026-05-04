"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        allowedHeaders: 'Content-Type,Accept,X-Role,X-User-Id,X-User-Name',
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
    }));
    app.setGlobalPrefix('api');
    const config = new swagger_1.DocumentBuilder()
        .setTitle('ENDUR API')
        .setDescription(`
      REST API for the **ENDUR Performance Review & Feedback Management System**.

      ## Role-Based Access Control
      All protected endpoints require the \`X-Role\` header with one of:
      \`superuser\` | \`admin\` | \`dean\` | \`hod\` | \`faculty\` | \`student\`

      Additionally, pass \`X-User-Id\` and \`X-User-Name\` headers to attribute audit logs correctly.

      ## Authentication
      Use \`POST /api/auth/login\` to verify credentials. The response contains the user object
      which you should store client-side (session) and use to populate role headers.
      `)
        .setVersion('1.0')
        .addGlobalParameters({
        in: 'header',
        name: 'X-Role',
        required: true,
        description: 'Caller role for RBAC (required for protected endpoints)',
        schema: {
            type: 'string',
            enum: ['superuser', 'admin', 'dean', 'hod', 'faculty', 'student'],
            example: 'hod',
        },
    })
        .addGlobalParameters({
        in: 'header',
        name: 'X-User-Id',
        required: false,
        description: 'The ID of the user performing the action (for audit logs)',
        schema: {
            type: 'string',
            example: 'H001'
        },
    })
        .addGlobalParameters({
        in: 'header',
        name: 'X-User-Name',
        required: false,
        description: 'The name of the user performing the action (for audit logs)',
        schema: {
            type: 'string',
            example: 'Prof. Alan Turing'
        },
    })
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api/docs', app, document);
    const docsDir = path.join(__dirname, '..', 'docs');
    if (!fs.existsSync(docsDir))
        fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'swagger.json'), JSON.stringify(document, null, 2));
    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`\n🚀 ENDUR API running at: http://localhost:${port}/api`);
    console.log(`📖 Swagger UI at:         http://localhost:${port}/api/docs\n`);
}
bootstrap();
//# sourceMappingURL=main.js.map