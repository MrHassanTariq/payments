import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PAYMENT_PROVIDER, IPaymentProvider } from './interfaces/payment-provider.interface';
import { StripeProvider } from './providers/stripe.provider';
import { PayPalProvider } from './providers/paypal.provider';
import { AirwallexProvider } from './providers/airwallex.provider';

/**
 * Payment Module
 * 
 * HOW PROVIDER SWITCHING WORKS:
 * 
 * 1. Set PAYMENT_PROVIDER env variable (stripe, paypal, or airwallex)
 * 2. The factory below reads that value and creates the right provider
 * 3. PaymentService receives whichever provider was created
 * 4. PaymentService doesn't know or care which one it is
 */
@Module({
  controllers: [PaymentController],
  providers: [
    PaymentService,
    
    // This is where the magic happens:
    // We tell NestJS "when someone asks for PAYMENT_PROVIDER, run this factory"
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (config: ConfigService): IPaymentProvider => {
        // Step 1: Read which provider to use from environment
        const providerName = config.get<string>('PAYMENT_PROVIDER') || 'stripe';
        
        // Step 2: Create and return the appropriate provider
        switch (providerName) {
          case 'stripe':
            return new StripeProvider(config);
          
          case 'paypal':
            return new PayPalProvider(config);
          
          case 'airwallex':
            return new AirwallexProvider(config);
          
          default:
            throw new Error(`Unknown provider: ${providerName}. Use: stripe, paypal, or airwallex`);
        }
      },
      inject: [ConfigService], // Factory needs ConfigService to read env vars
    },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
