import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database';
import { PaymentModule } from './payment';

@Module({
  imports: [
    // Load environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    
    // Database connection
    DatabaseModule,
    
    // Payment module
    // Provider is selected via PAYMENT_PROVIDER env var (stripe, paypal, airwallex)
    PaymentModule,
  ],
})
export class AppModule {}
