import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IPaymentProvider,
  CreatePaymentRequest,
  PaymentResult,
  GetPaymentRequest,
  CancelPaymentRequest,
  RefundRequest,
  RefundResult,
  WebhookEvent,
  PaymentStatus,
} from '../interfaces/payment-provider.interface';

/**
 * Stripe Payment Provider
 * 
 * Implements the IPaymentProvider interface for Stripe.
 * All Stripe-specific logic is encapsulated here.
 * 
 * Note: In production, you'd use the official Stripe SDK.
 * This is a simplified implementation showing the pattern.
 */
@Injectable()
export class StripeProvider implements IPaymentProvider {
  readonly providerName = 'stripe';
  private readonly logger = new Logger(StripeProvider.name);
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly apiBase = 'https://api.stripe.com/v1';

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('STRIPE_SECRET_KEY') || '';
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '';
  }

  async createPayment(request: CreatePaymentRequest): Promise<PaymentResult> {
    this.logger.log(`Creating Stripe payment for reference: ${request.referenceId}`);

    try {
      // Create PaymentIntent via Stripe API
      const response = await this.stripeRequest('payment_intents', {
        amount: request.amount, // Stripe expects amount in cents
        currency: request.currency.toLowerCase(),
        description: request.description,
        metadata: {
          reference_id: request.referenceId,
          ...request.metadata,
        },
        receipt_email: request.customer?.email,
        // For automatic confirmation with provided payment method
        ...(request.paymentMethod?.token && {
          payment_method: request.paymentMethod.token,
          confirm: true,
        }),
      });

      return this.mapStripePaymentIntent(response);
    } catch (error) {
      this.logger.error(`Stripe createPayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'stripe_error',
          message: error.message,
        },
      };
    }
  }

  async getPayment(request: GetPaymentRequest): Promise<PaymentResult> {
    this.logger.log(`Getting Stripe payment: ${request.providerTransactionId}`);

    try {
      const response = await this.stripeRequest(
        `payment_intents/${request.providerTransactionId}`,
        null,
        'GET'
      );

      return this.mapStripePaymentIntent(response);
    } catch (error) {
      this.logger.error(`Stripe getPayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'stripe_error',
          message: error.message,
        },
      };
    }
  }

  async cancelPayment(request: CancelPaymentRequest): Promise<PaymentResult> {
    this.logger.log(`Cancelling Stripe payment: ${request.providerTransactionId}`);

    try {
      const response = await this.stripeRequest(
        `payment_intents/${request.providerTransactionId}/cancel`,
        {
          cancellation_reason: request.reason || 'requested_by_customer',
        }
      );

      return this.mapStripePaymentIntent(response);
    } catch (error) {
      this.logger.error(`Stripe cancelPayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'stripe_error',
          message: error.message,
        },
      };
    }
  }

  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    this.logger.log(`Creating Stripe refund for: ${request.providerTransactionId}`);

    try {
      const response = await this.stripeRequest('refunds', {
        payment_intent: request.providerTransactionId,
        amount: request.amount,
        reason: this.mapRefundReason(request.reason),
        metadata: request.metadata,
      });

      return {
        success: response.status === 'succeeded',
        providerRefundId: response.id,
        status: response.status === 'succeeded' ? 'completed' : 'pending',
      };
    } catch (error) {
      this.logger.error(`Stripe refundPayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'stripe_error',
          message: error.message,
        },
      };
    }
  }

  async verifyWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent | null> {
    try {
      // In production, use stripe.webhooks.constructEvent()
      // This is a simplified verification
      const event = JSON.parse(payload.toString());
      
      // Map Stripe event to our generic event
      return this.mapStripeWebhookEvent(event);
    } catch (error) {
      this.logger.error(`Stripe webhook verification failed: ${error.message}`);
      return null;
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async stripeRequest(
    endpoint: string,
    data: Record<string, unknown> | null,
    method: 'POST' | 'GET' = 'POST'
  ): Promise<any> {
    const url = `${this.apiBase}/${endpoint}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (data && method === 'POST') {
      options.body = this.encodeFormData(data);
    }

    const response = await fetch(url, options);
    const json = await response.json();

    if (!response.ok) {
      const error = new Error(json.error?.message || 'Stripe API error');
      (error as any).code = json.error?.code;
      throw error;
    }

    return json;
  }

  private encodeFormData(data: Record<string, unknown>, prefix = ''): string {
    const pairs: string[] = [];
    
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;
      
      const encodedKey = prefix ? `${prefix}[${key}]` : key;
      
      if (typeof value === 'object' && !Array.isArray(value)) {
        pairs.push(this.encodeFormData(value as Record<string, unknown>, encodedKey));
      } else {
        pairs.push(`${encodeURIComponent(encodedKey)}=${encodeURIComponent(String(value))}`);
      }
    }
    
    return pairs.filter(Boolean).join('&');
  }

  private mapStripePaymentIntent(intent: any): PaymentResult {
    return {
      success: ['succeeded', 'processing'].includes(intent.status),
      providerTransactionId: intent.id,
      status: this.mapStripeStatus(intent.status),
      clientSecret: intent.client_secret,
      rawResponse: intent,
    };
  }

  private mapStripeStatus(stripeStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'requires_payment_method': 'pending',
      'requires_confirmation': 'pending',
      'requires_action': 'requires_action',
      'processing': 'processing',
      'requires_capture': 'processing',
      'succeeded': 'completed',
      'canceled': 'cancelled',
    };
    return statusMap[stripeStatus] || 'failed';
  }

  private mapRefundReason(reason?: string): string {
    // Stripe only accepts specific refund reasons
    const validReasons = ['duplicate', 'fraudulent', 'requested_by_customer'];
    return reason && validReasons.includes(reason) ? reason : 'requested_by_customer';
  }

  private mapStripeWebhookEvent(event: any): WebhookEvent | null {
    const eventMap: Record<string, WebhookEvent['type']> = {
      'payment_intent.succeeded': 'payment.completed',
      'payment_intent.payment_failed': 'payment.failed',
      'payment_intent.canceled': 'payment.cancelled',
      'charge.refunded': 'refund.completed',
      'refund.failed': 'refund.failed',
    };

    const type = eventMap[event.type];
    if (!type) return null;

    return {
      type,
      providerTransactionId: event.data.object.id,
      data: event.data.object,
    };
  }
}
