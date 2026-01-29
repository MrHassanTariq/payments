import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Enable raw body for webhook signature verification
    rawBody: true,
  });

  // Enable CORS for frontend SDK integration
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   💳 Payment Service Running                                   ║
║                                                                ║
║   Server:   http://localhost:${port}                             ║
║   Provider: ${process.env.PAYMENT_PROVIDER || 'stripe'}                                        ║
║                                                                ║
║   Endpoints:                                                   ║
║   POST   /payments          - Create payment                   ║
║   GET    /payments/:id      - Get payment                      ║
║   POST   /payments/:id/sync - Sync with provider               ║
║   POST   /payments/:id/cancel - Cancel payment                 ║
║   POST   /payments/refund   - Refund payment                   ║
║   POST   /payments/webhook  - Provider webhooks                ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
