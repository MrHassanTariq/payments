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
    
    // Payment module - provider is selected via PAYMENT_PROVIDER env var
    // Change this single value to switch providers (stripe, paypal, airwallex)
    PaymentModule.forRoot(),
  ],
})
export class AppModule {}
