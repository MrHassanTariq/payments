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
 * Airwallex Payment Provider
 * 
 * Implements the IPaymentProvider interface for Airwallex.
 * Useful for businesses with international payment needs.
 */
@Injectable()
export class AirwallexProvider implements IPaymentProvider {
  readonly providerName = 'airwallex';
  private readonly logger = new Logger(AirwallexProvider.name);
  private readonly apiKey: string;
  private readonly clientId: string;
  private readonly apiBase: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('AIRWALLEX_API_KEY') || '';
    this.clientId = this.configService.get<string>('AIRWALLEX_CLIENT_ID') || '';
    
    const mode = this.configService.get<string>('AIRWALLEX_MODE') || 'demo';
    this.apiBase = mode === 'prod' 
      ? 'https://api.airwallex.com' 
      : 'https://api-demo.airwallex.com';
  }

  async createPayment(request: CreatePaymentRequest): Promise<PaymentResult> {
    this.logger.log(`Creating Airwallex payment intent for reference: ${request.referenceId}`);

    try {
      const response = await this.airwallexRequest('api/v1/pa/payment_intents/create', {
        request_id: request.referenceId,
        amount: request.amount / 100, // Airwallex uses decimal amount
        currency: request.currency.toUpperCase(),
        merchant_order_id: request.referenceId,
        descriptor: request.description,
        metadata: request.metadata,
        return_url: request.returnUrl,
      });

      return {
        success: true,
        providerTransactionId: response.id,
        status: this.mapAirwallexStatus(response.status),
        clientSecret: response.client_secret,
        rawResponse: response,
      };
    } catch (error) {
      this.logger.error(`Airwallex createPayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'airwallex_error',
          message: error.message,
        },
      };
    }
  }

  async getPayment(request: GetPaymentRequest): Promise<PaymentResult> {
    this.logger.log(`Getting Airwallex payment: ${request.providerTransactionId}`);

    try {
      const response = await this.airwallexRequest(
        `api/v1/pa/payment_intents/${request.providerTransactionId}`,
        null,
        'GET'
      );

      return {
        success: true,
        providerTransactionId: response.id,
        status: this.mapAirwallexStatus(response.status),
        rawResponse: response,
      };
    } catch (error) {
      this.logger.error(`Airwallex getPayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'airwallex_error',
          message: error.message,
        },
      };
    }
  }

  async cancelPayment(request: CancelPaymentRequest): Promise<PaymentResult> {
    this.logger.log(`Cancelling Airwallex payment: ${request.providerTransactionId}`);

    try {
      const response = await this.airwallexRequest(
        `api/v1/pa/payment_intents/${request.providerTransactionId}/cancel`,
        { cancellation_reason: request.reason }
      );

      return {
        success: true,
        providerTransactionId: response.id,
        status: this.mapAirwallexStatus(response.status),
        rawResponse: response,
      };
    } catch (error) {
      this.logger.error(`Airwallex cancelPayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'airwallex_error',
          message: error.message,
        },
      };
    }
  }

  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    this.logger.log(`Creating Airwallex refund for: ${request.providerTransactionId}`);

    try {
      const response = await this.airwallexRequest('api/v1/pa/refunds/create', {
        payment_intent_id: request.providerTransactionId,
        amount: request.amount / 100,
        reason: request.reason,
        metadata: request.metadata,
      });

      return {
        success: response.status === 'SUCCEEDED',
        providerRefundId: response.id,
        status: response.status === 'SUCCEEDED' ? 'completed' : 'pending',
      };
    } catch (error) {
      this.logger.error(`Airwallex refundPayment failed: ${error.message}`);
      return {
        success: false,
        status: 'failed',
        error: {
          code: error.code || 'airwallex_error',
          message: error.message,
        },
      };
    }
  }

  async verifyWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent | null> {
    try {
      const event = JSON.parse(payload.toString());
      return this.mapAirwallexWebhookEvent(event);
    } catch (error) {
      this.logger.error(`Airwallex webhook verification failed: ${error.message}`);
      return null;
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const response = await fetch(`${this.apiBase}/api/v1/authentication/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': this.clientId,
        'x-api-key': this.apiKey,
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to get Airwallex access token');
    }

    this.accessToken = data.token;
    this.tokenExpiry = Date.now() + (data.expires_at ? new Date(data.expires_at).getTime() - Date.now() : 3600000);
    
    return this.accessToken!;
  }

  private async airwallexRequest(
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
    const json = await response.json();

    if (!response.ok) {
      const error = new Error(json.message || 'Airwallex API error');
      (error as any).code = json.code;
      throw error;
    }

    return json;
  }

  private mapAirwallexStatus(status: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'INITIAL': 'pending',
      'REQUIRES_PAYMENT_METHOD': 'pending',
      'REQUIRES_CUSTOMER_ACTION': 'requires_action',
      'REQUIRES_CAPTURE': 'processing',
      'SUCCEEDED': 'completed',
      'CANCELLED': 'cancelled',
      'FAILED': 'failed',
    };
    return statusMap[status] || 'failed';
  }

  private mapAirwallexWebhookEvent(event: any): WebhookEvent | null {
    const eventMap: Record<string, WebhookEvent['type']> = {
      'payment_intent.succeeded': 'payment.completed',
      'payment_intent.payment_failed': 'payment.failed',
      'payment_intent.cancelled': 'payment.cancelled',
      'refund.succeeded': 'refund.completed',
      'refund.failed': 'refund.failed',
    };

    const type = eventMap[event.name];
    if (!type) return null;

    return {
      type,
      providerTransactionId: event.data?.object?.id,
      data: event.data?.object,
    };
  }
}
