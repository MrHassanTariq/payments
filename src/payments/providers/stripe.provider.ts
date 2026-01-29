import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  IPaymentProvider,
  CreateChargeParams,
  ChargeResult,
  RefundParams,
  RefundResult,
  GetTransactionParams,
  TransactionDetails,
  CancelParams,
  CancelResult,
  PaymentStatus,
} from '../interfaces/payment-provider.interface';

/**
 * Stripe Payment Provider
 *
 * Implements the IPaymentProvider interface for Stripe.
 * All Stripe-specific logic is contained here.
 */
@Injectable()
export class StripeProvider implements IPaymentProvider {
  readonly providerName = 'stripe';
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
    });
  }

  async createCharge(params: CreateChargeParams): Promise<ChargeResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: params.amount,
        currency: params.currency.toLowerCase(),
        metadata: {
          ...params.metadata,
          customerId: params.customerId || '',
          orderId: params.orderId || '',
        },
        description: params.description,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
      });

      // For server-side charges, confirm immediately
      const confirmedIntent = await this.stripe.paymentIntents.confirm(paymentIntent.id, {
        payment_method: 'pm_card_visa', // In production, this comes from client
      });

      return {
        success: confirmedIntent.status === 'succeeded',
        providerTransactionId: confirmedIntent.id,
        status: this.mapStripeStatus(confirmedIntent.status),
        rawResponse: confirmedIntent,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        providerTransactionId: '',
        status: 'failed',
        errorMessage: stripeError.message,
        rawResponse: error,
      };
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: params.providerTransactionId,
        amount: params.amount,
        reason: params.reason as Stripe.RefundCreateParams.Reason,
      });

      return {
        success: refund.status === 'succeeded',
        providerRefundId: refund.id,
        status: refund.status === 'succeeded' ? 'refunded' : 'failed',
        rawResponse: refund,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        providerRefundId: '',
        status: 'failed',
        errorMessage: stripeError.message,
        rawResponse: error,
      };
    }
  }

  async getTransaction(params: GetTransactionParams): Promise<TransactionDetails | null> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(params.providerTransactionId);

      return {
        providerTransactionId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase(),
        status: this.mapStripeStatus(paymentIntent.status),
        createdAt: new Date(paymentIntent.created * 1000),
        metadata: paymentIntent.metadata as Record<string, string>,
        rawResponse: paymentIntent,
      };
    } catch {
      return null;
    }
  }

  async cancel(params: CancelParams): Promise<CancelResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.cancel(params.providerTransactionId, {
        cancellation_reason: 'requested_by_customer',
      });

      return {
        success: paymentIntent.status === 'canceled',
        status: paymentIntent.status === 'canceled' ? 'cancelled' : 'failed',
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        status: 'failed',
        errorMessage: stripeError.message,
      };
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.stripe.balance.retrieve();
      return true;
    } catch {
      return false;
    }
  }

  private mapStripeStatus(status: Stripe.PaymentIntent.Status): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      requires_payment_method: 'pending',
      requires_confirmation: 'pending',
      requires_action: 'processing',
      processing: 'processing',
      requires_capture: 'processing',
      canceled: 'cancelled',
      succeeded: 'completed',
    };
    return statusMap[status] || 'pending';
  }
}
