/**
 * Payment DTOs
 * 
 * These DTOs define the API contract. They are provider-agnostic.
 * The business logic uses these DTOs, never provider-specific types.
 */

export class CreatePaymentDto {
  /** Your internal reference (order ID, invoice ID, etc.) */
  referenceId: string;

  /** Amount in cents (e.g., 1000 = $10.00) */
  amount: number;

  /** Currency code (default: USD) */
  currency?: string = 'USD';

  /** Customer email for receipts */
  customerEmail?: string;

  /** Customer ID from your system */
  customerId?: string;

  /** Description shown on payment */
  description?: string;

  /** Payment method token (from frontend SDK) */
  paymentMethodToken?: string;

  /** Payment method type */
  paymentMethodType?: 'card' | 'bank_transfer' | 'wallet';

  /** Return URL after payment (for redirect flows) */
  returnUrl?: string;

  /** Cancel URL (for redirect flows) */
  cancelUrl?: string;

  /** Any additional metadata */
  metadata?: Record<string, string>;
}

export class RefundPaymentDto {
  /** The transaction ID to refund */
  transactionId: string;

  /** Amount to refund in cents (for partial refunds) */
  amount?: number;

  /** Reason for the refund */
  reason?: string;
}

export class GetPaymentDto {
  transactionId: string;
}

export class CancelPaymentDto {
  transactionId: string;
  reason?: string;
}

// Response DTOs

export class PaymentResponseDto {
  success: boolean;
  transactionId?: string;
  providerTransactionId?: string;
  status: string;
  redirectUrl?: string;
  clientSecret?: string;
  error?: {
    code: string;
    message: string;
  };
}

export class RefundResponseDto {
  success: boolean;
  refundId?: string;
  status: string;
  error?: {
    code: string;
    message: string;
  };
}

export class TransactionDto {
  id: string;
  referenceId: string;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  providerTransactionId?: string;
  customerEmail?: string;
  createdAt: Date;
  completedAt?: Date;
}
