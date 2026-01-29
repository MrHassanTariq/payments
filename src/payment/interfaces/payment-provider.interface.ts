/**
 * Payment Provider Interface
 * 
 * This is the core abstraction that decouples business logic from payment providers.
 * All payment providers (Stripe, PayPal, Airwallex, etc.) must implement this interface.
 * 
 * The business logic ONLY interacts with this interface, never with concrete providers.
 * This allows swapping providers without changing any business logic.
 */

// ============================================================================
// Request/Response Types (Provider-Agnostic)
// ============================================================================

export interface CreatePaymentRequest {
  /** Your internal reference ID (order ID, invoice ID, etc.) */
  referenceId: string;
  
  /** Amount in the smallest currency unit (cents for USD) */
  amount: number;
  
  /** ISO 4217 currency code */
  currency: string;
  
  /** Customer information */
  customer?: {
    id?: string;
    email?: string;
    name?: string;
  };
  
  /** Payment method details */
  paymentMethod?: {
    type: 'card' | 'bank_transfer' | 'wallet';
    token?: string; // Tokenized payment method from frontend
  };
  
  /** Description shown to customer */
  description?: string;
  
  /** Flexible metadata for your business needs */
  metadata?: Record<string, string>;
  
  /** URL to redirect after payment (for hosted checkout flows) */
  returnUrl?: string;
  
  /** URL for cancellation redirect */
  cancelUrl?: string;
}

export interface PaymentResult {
  /** Whether the operation succeeded */
  success: boolean;
  
  /** Provider's transaction/payment ID */
  providerTransactionId?: string;
  
  /** Current status of the payment */
  status: PaymentStatus;
  
  /** For redirect-based flows (PayPal, 3DS, etc.) */
  redirectUrl?: string;
  
  /** Client secret for frontend SDK (Stripe Elements, etc.) */
  clientSecret?: string;
  
  /** Error information if failed */
  error?: {
    code: string;
    message: string;
  };
  
  /** Raw response from provider (for debugging) */
  rawResponse?: unknown;
}

export type PaymentStatus = 
  | 'pending'
  | 'processing' 
  | 'requires_action' // Needs customer action (3DS, redirect, etc.)
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RefundRequest {
  /** Provider's original transaction ID */
  providerTransactionId: string;
  
  /** Amount to refund (partial refund if less than original) */
  amount: number;
  
  /** Currency */
  currency: string;
  
  /** Reason for refund */
  reason?: string;
  
  /** Your internal reference */
  metadata?: Record<string, string>;
}

export interface RefundResult {
  success: boolean;
  providerRefundId?: string;
  status: 'pending' | 'completed' | 'failed';
  error?: {
    code: string;
    message: string;
  };
}

export interface GetPaymentRequest {
  providerTransactionId: string;
}

export interface CancelPaymentRequest {
  providerTransactionId: string;
  reason?: string;
}

// ============================================================================
// Payment Provider Interface
// ============================================================================

export interface IPaymentProvider {
  /** Unique identifier for this provider */
  readonly providerName: string;
  
  /**
   * Create a new payment/charge
   */
  createPayment(request: CreatePaymentRequest): Promise<PaymentResult>;
  
  /**
   * Get payment status/details
   */
  getPayment(request: GetPaymentRequest): Promise<PaymentResult>;
  
  /**
   * Cancel a pending payment
   */
  cancelPayment(request: CancelPaymentRequest): Promise<PaymentResult>;
  
  /**
   * Refund a completed payment (full or partial)
   */
  refundPayment(request: RefundRequest): Promise<RefundResult>;
  
  /**
   * Verify webhook signature and parse event
   */
  verifyWebhook(payload: string | Buffer, signature: string): Promise<WebhookEvent | null>;
}

// ============================================================================
// Webhook Types
// ============================================================================

export type WebhookEventType = 
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'refund.completed'
  | 'refund.failed';

export interface WebhookEvent {
  type: WebhookEventType;
  providerTransactionId: string;
  data: Record<string, unknown>;
}

// ============================================================================
// Provider Token (for DI)
// ============================================================================

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
