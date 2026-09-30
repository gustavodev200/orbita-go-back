import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);

  // Vercel fica atrás de proxy — sem isso o throttler vê o IP do proxy, não do cliente.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({
    origin: config
      .getOrThrow<string>('FRONTEND_URL')
      .split(',')
      .map((origin) => origin.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.useGlobalFilters(new HttpExceptionFilter());

  if (config.get<boolean>('SWAGGER_ENABLED')) {
    const documentConfig = new DocumentBuilder()
      .setTitle('órbitaGO API')
      .setDescription(
        'Finanças + tarefas gamificado. Contrato completo em API_CONTRACT.md.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, documentConfig),
    );
  }
}
