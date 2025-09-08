import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { OrderModule } from './examples/order.example';

const PORT = 3000;

async function bootstrap() {
  const app = await NestFactory.create(OrderModule);
  await app.listen(PORT);
}

bootstrap().catch((err) => {
  const logger = new Logger('bootstrap');
  logger.error('Bootstrap failed', err as any);
  process.exit(1);
});
