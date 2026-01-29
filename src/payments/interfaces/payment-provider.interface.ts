/**
 * Payment Provider Interface
 *
 * This interface defines the contract that ALL payment providers must implement.
 * The business logic (PaymentService) depends ONLY on this interface, not on
 * any specific provider implementation.
 *
 * To add a new payment provider:
 * 1. Create a new class that implements IPaymentProvider
 * 2. Register it in the PaymentsModule
 * 3. Update the provider factory to support the new provider
 *
 * The business logic remains unchanged when switching providers.
 */

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'cancelled';

export interface CreateChargeParams {
  amount: number; // Amount in smallest currency unit (e.g., cents)
  currency: string;
  customerId?: string;
  orderId?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface ChargeResult {
  success: boolean;
  providerTransactionId: string;
  status: PaymentStatus;
  errorMessage?: string;
  rawResponse?: unknown; // Provider-specific response for debugging
}

export interface RefundParams {
  providerTransactionId: string;
  amount?: number; // Optional for partial refunds, full refund if not specified
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  providerRefundId: string;
  status: PaymentStatus;
  errorMessage?: string;
  rawResponse?: unknown;
}

export interface GetTransactionParams {
  providerTransactionId: string;
}

export interface TransactionDetails {
  providerTransactionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: Date;
  metadata?: Record<string, string>;
  rawResponse?: unknown;
}

export interface CancelParams {
  providerTransactionId: string;
  reason?: string;
}

export interface CancelResult {
  success: boolean;
  status: PaymentStatus;
  errorMessage?: string;
}

/**
 * The Payment Provider Interface
 *
 * Every payment provider (Stripe, PayPal, Airwallex, etc.) must implement this interface.
 * This ensures the business logic can work with any provider without modification.
 */
export interface IPaymentProvider {
  /**
   * Returns the unique name of this provider (e.g., 'stripe', 'paypal')
   */
  readonly providerName: string;

  /**
   * Create a charge/payment
   */
  createCharge(params: CreateChargeParams): Promise<ChargeResult>;

  /**
   * Process a refund
   */
  refund(params: RefundParams): Promise<RefundResult>;

  /**
   * Get transaction details from the provider
   */
  getTransaction(params: GetTransactionParams): Promise<TransactionDetails | null>;

  /**
   * Cancel a pending payment (if supported by provider)
   */
  cancel(params: CancelParams): Promise<CancelResult>;

  /**
   * Verify the provider connection/credentials are valid
   */
  verifyConnection(): Promise<boolean>;
}
