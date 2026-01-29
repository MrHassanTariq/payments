import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';
import { StripeProvider } from './providers/stripe.provider';
import { PayPalProvider } from './providers/paypal.provider';

/**
 * Payments Module
 *
 * This module wires together the payment infrastructure using NestJS dependency injection.
 *
 * The key pattern here is the PAYMENT_PROVIDER factory:
 * - It reads the PAYMENT_PROVIDER environment variable
 * - Returns the appropriate provider implementation
 * - The PaymentsService receives this via constructor injection
 *
 * To add a new provider:
 * 1. Create a new provider class implementing IPaymentProvider
 * 2. Add it to the switch statement in the factory below
 * 3. Set PAYMENT_PROVIDER env var to use it
 *
 * The business logic (PaymentsService) requires NO changes when adding providers.
 */
@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    StripeProvider,
    PayPalProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, StripeProvider, PayPalProvider],
      useFactory: (
        configService: ConfigService,
        stripeProvider: StripeProvider,
        paypalProvider: PayPalProvider,
      ) => {
        const providerName = configService.get<string>('PAYMENT_PROVIDER') || 'stripe';

        switch (providerName.toLowerCase()) {
          case 'stripe':
            return stripeProvider;
          case 'paypal':
            return paypalProvider;
          default:
            console.warn(`Unknown provider "${providerName}", defaulting to Stripe`);
            return stripeProvider;
        }
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
