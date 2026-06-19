import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);

  // 全局前缀
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  // CORS
  app.enableCors({
    origin: (origin, cb) => cb(null, true), // dev 全部放行;prod 配置白名单
    credentials: true,
  });

  // 全局校验
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 全局异常过滤器
  app.useGlobalFilters(new GlobalExceptionFilter());

  // BigInt → string (Prisma BigInt 字段如 sizeBytes/blockHeight 在 JSON.stringify 会抛错)
  // 包装 express res.json,所有响应走 JSON.stringify(_, bigintReplacer)
  //
  // 注意: Express 4.22+ 把 app.response 从「构造器」改成了「默认 ServerResponse 实例」,
  // 所以 expressApp.response.prototype 是 undefined。必须从实例反查原型。
  // 之前的写法 (`expressApp.response?.prototype?.json`) 在新 Express 永远装不上 wrapper,
  // 暴露症状: IP 有 files 时 /ips/mine/list 抛 "Do not know how to serialize a BigInt"
  const expressApp = app.getHttpAdapter().getInstance();
  const bigintReplacer = (_key: string, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value;
  const responseProto = Object.getPrototypeOf(expressApp.response) as { json?: Function } | null;
  if (responseProto && typeof responseProto.json === 'function') {
    const originalJson = responseProto.json;
    responseProto.json = function (data: unknown) {
      return originalJson.call(this, JSON.parse(JSON.stringify(data, bigintReplacer)));
    };
  } else {
    Logger.warn('Express response.json 未找到,BigInt 序列化兜底未安装', 'Bootstrap');
  }

  // Swagger
  if (config.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ibi.ren API')
      .setDescription('AI 虚拟人资产与版权交易平台')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, doc);
  }

  const port = config.get<number>('API_PORT', 3000);
  await app.listen(port);
  Logger.log(`🚀 ibi.ren API listening on http://localhost:${port}/api/v1`, 'Bootstrap');
  Logger.log(`📚 Swagger UI:  http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});