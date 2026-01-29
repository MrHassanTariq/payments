import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';
import { StripeProvider } from './providers/stripe.provider';
import { PayPalProvider } from './providers/paypal.provider';
import { AirwallexProvider } from './providers/airwallex.provider';

/**
 * Payment Module
 * 
 * This module wires everything together. The key design principle:
 * - PaymentService depends on IPaymentProvider (interface)
 * - The actual provider is selected at runtime via configuration
 * - No business logic changes needed when switching providers
 * 
 * To add a new provider:
 * 1. Create a new provider class implementing IPaymentProvider
 * 2. Add it to the providerMap below
 * 3. Update your environment variable
 * 
 * That's it! No changes to PaymentService, controllers, or other business logic.
 */

// Map of available providers
const providerMap = {
  stripe: StripeProvider,
  paypal: PayPalProvider,
  airwallex: AirwallexProvider,
};

type ProviderName = keyof typeof providerMap;

@Module({})
export class PaymentModule {
  /**
   * Configure the payment module with a specific provider
   * 
   * Usage in AppModule:
   * PaymentModule.forRoot() - Uses PAYMENT_PROVIDER env variable
   * PaymentModule.forRoot('stripe') - Explicitly use Stripe
   */
  static forRoot(providerName?: ProviderName): DynamicModule {
    return {
      module: PaymentModule,
      controllers: [PaymentController],
      providers: [
        PaymentService,
        // All providers are available for DI
        StripeProvider,
        PayPalProvider,
        AirwallexProvider,
        // Factory that selects the active provider
        {
          provide: PAYMENT_PROVIDER,
          useFactory: (
            configService: ConfigService,
            stripe: StripeProvider,
            paypal: PayPalProvider,
            airwallex: AirwallexProvider,
          ) => {
            // Use explicit provider name or get from config
            const selectedProvider = providerName || 
              configService.get<string>('PAYMENT_PROVIDER') || 
              'stripe';

            const providers = {
              stripe,
              paypal,
              airwallex,
            };

            const provider = providers[selectedProvider as ProviderName];
            
            if (!provider) {
              throw new Error(
                `Unknown payment provider: ${selectedProvider}. ` +
                `Available providers: ${Object.keys(providers).join(', ')}`
              );
            }

            console.log(`✅ Payment provider initialized: ${selectedProvider}`);
            return provider;
          },
          inject: [ConfigService, StripeProvider, PayPalProvider, AirwallexProvider],
        },
      ],
      exports: [PaymentService, PAYMENT_PROVIDER],
    };
  }
}
