import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';
import { ICONS } from './landing/icons';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hbs = require('hbs');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const root = join(__dirname, '..');

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.useStaticAssets(join(root, 'public'), { prefix: '/static/', maxAge: '1d' });
  app.setBaseViewsDir(join(root, 'views'));
  app.setViewEngine('hbs');
  hbs.registerPartials(join(root, 'views', 'partials'));
  // Cache-busting suffix for /static assets, changes on every deploy/restart.
  const assetVersion = Date.now().toString(36);
  hbs.registerHelper('v', () => assetVersion);
  hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  hbs.registerHelper('inc', (n: number) => n + 1);
  hbs.registerHelper('icon', (name: string) => new hbs.SafeString(ICONS[name] ?? ''));
  hbs.registerHelper('json', (v: unknown) => new hbs.SafeString(JSON.stringify(v).replace(/</g, '\\u003c')));
  hbs.registerHelper('pad', (n: number) => String(n + 1).padStart(2, '0'));
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`MultiAITrading running on http://localhost:${port}  (admin: /admin)`, 'Bootstrap');
}
bootstrap();
