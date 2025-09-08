import { NestFactory } from '@nestjs/core';
import { OrderModule } from './order.example';

async function bootstrap() {
  // Create a lightweight Nest application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(OrderModule);
  await app.listen(3000);
}

bootstrap();
