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
 * PayPal Payment Provider
 * 
 * Implements the IPaymentProvider interface for PayPal.
 * All PayPal-specific logic is encapsulated here.
 */
@Injectable()
export class PayPalProvider implements IPaymentProvider {
  readonly providerName = 'paypal';
  private readonly logger = new Logger(PayPalProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly apiBase: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('PAYPAL_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET') || '';
    
    const mode = this.configService.get<string>('PAYPAL_MODE') || 'sandbox';
    this.apiBase = mode === 'live' 
      ? 'https://api-m.paypal.com' 
      : 'https://api-m.sandbox.paypal.com';
  }

  async createPayment(request: CreatePaymentRequest): Promise<PaymentResult> {
    this.logger.log(`Creating PayPal order for reference: ${request.referenceId}`);

    try {
      const response = await this.paypalRequest('v2/checkout/orders', {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: request.referenceId,
          description: request.description,
          amount: {
            currency_code: request.currency.toUpperCase(),
            value: (request.amount / 100).toFixed(2), // PayPal expects dollars, not cents
          },
          custom_id: request.referenceId,
        }],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: request.returnUrl,
              cancel_url: request.cancelUrl,
              user_action: 'PAY_NOW',
            },
          },
        },
      });

      // Find the approval URL for redirect
      const approvalLink = response.links?.find((l: any) => l.rel === 'payer-action');

      return {
        success: true,
        providerTransactionId: response.id,
        status: this.mapPayPalStatus(response.status),
        redirectUrl: approvalLink?.href,
        rawResponse: response,
      };
    } catch (error) {
      this.logger.error(`PayPal createPayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'paypal_error',
          message: error.message,
        },
      };
    }
  }

  async getPayment(request: GetPaymentRequest): Promise<PaymentResult> {
    this.logger.log(`Getting PayPal order: ${request.providerTransactionId}`);

    try {
      const response = await this.paypalRequest(
        `v2/checkout/orders/${request.providerTransactionId}`,
        null,
        'GET'
      );

      return {
        success: true,
        providerTransactionId: response.id,
        status: this.mapPayPalStatus(response.status),
        rawResponse: response,
      };
    } catch (error) {
      this.logger.error(`PayPal getPayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'paypal_error',
          message: error.message,
        },
      };
    }
  }

  async cancelPayment(request: CancelPaymentRequest): Promise<PaymentResult> {
    this.logger.log(`Cancelling PayPal order: ${request.providerTransactionId}`);

    // PayPal orders can't be explicitly cancelled via API
    // They expire automatically or you can void after authorization
    // For this example, we'll return the current status
    return this.getPayment({ providerTransactionId: request.providerTransactionId });
  }

  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    this.logger.log(`Creating PayPal refund for: ${request.providerTransactionId}`);

    try {
      // First, get the capture ID from the order
      const order = await this.paypalRequest(
        `v2/checkout/orders/${request.providerTransactionId}`,
        null,
        'GET'
      );

      const captureId = order.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      
      if (!captureId) {
        return {
          success: false,
          status: 'failed',
          error: {
            code: 'no_capture',
            message: 'No capture found for this order',
          },
        };
      }

      const response = await this.paypalRequest(`v2/payments/captures/${captureId}/refund`, {
        amount: {
          value: (request.amount / 100).toFixed(2),
          currency_code: request.currency.toUpperCase(),
        },
        note_to_payer: request.reason,
      });

      return {
        success: response.status === 'COMPLETED',
        providerRefundId: response.id,
        status: response.status === 'COMPLETED' ? 'completed' : 'pending',
      };
    } catch (error) {
      this.logger.error(`PayPal refundPayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'paypal_error',
          message: error.message,
        },
      };
    }
  }

  async verifyWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent | null> {
    try {
      // In production, verify the webhook signature with PayPal
      const event = JSON.parse(payload.toString());
      return this.mapPayPalWebhookEvent(event);
    } catch (error) {
      this.logger.error(`PayPal webhook verification failed: ${error.message}`);
      return null;
    }
  }

  // ============================================================================
  // Capture Payment (PayPal-specific - called after customer approval)
  // ============================================================================

  async capturePayment(orderId: string): Promise<PaymentResult> {
    this.logger.log(`Capturing PayPal order: ${orderId}`);

    try {
      const response = await this.paypalRequest(
        `v2/checkout/orders/${orderId}/capture`,
        {}
      );

      return {
        success: response.status === 'COMPLETED',
        providerTransactionId: response.id,
        status: this.mapPayPalStatus(response.status),
        rawResponse: response,
      };
    } catch (error) {
      this.logger.error(`PayPal capturePayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'paypal_error',
          message: error.message,
        },
      };
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const response = await fetch(`${this.apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error_description || 'Failed to get PayPal access token');
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min early
    
    return this.accessToken!;
  }

  private async paypalRequest(
    endpoint: string,
    data: Record<string, unknown> | null,
    method: 'POST' | 'GET' = 'POST'
  ): Promise<any> {
    const accessToken = await this.getAccessToken();
    const url = `${this.apiBase}/${endpoint}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (data && method === 'POST') {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    // Handle empty responses (204 No Content)
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const error = new Error(json.message || json.error_description || 'PayPal API error');
      (error as any).code = json.name;
      throw error;
    }

    return json;
  }

  private mapPayPalStatus(paypalStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'CREATED': 'pending',
      'SAVED': 'pending',
      'APPROVED': 'requires_action', // Needs capture
      'PAYER_ACTION_REQUIRED': 'requires_action',
      'VOIDED': 'cancelled',
      'COMPLETED': 'completed',
    };
    return statusMap[paypalStatus] || 'failed';
  }

  private mapPayPalWebhookEvent(event: any): WebhookEvent | null {
    const eventMap: Record<string, WebhookEvent['type']> = {
      'CHECKOUT.ORDER.APPROVED': 'payment.completed',
      'PAYMENT.CAPTURE.COMPLETED': 'payment.completed',
      'PAYMENT.CAPTURE.DENIED': 'payment.failed',
      'CHECKOUT.ORDER.VOIDED': 'payment.cancelled',
      'PAYMENT.CAPTURE.REFUNDED': 'refund.completed',
    };

    const type = eventMap[event.event_type];
    if (!type) return null;

    return {
      type,
      providerTransactionId: event.resource?.id,
      data: event.resource,
    };
  }
}
