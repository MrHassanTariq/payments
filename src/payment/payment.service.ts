import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_CONNECTION } from '../database';
import { transactions, refunds, Transaction, NewTransaction } from '../database/schema';
import {
  IPaymentProvider,
  PAYMENT_PROVIDER,
  CreatePaymentRequest,
  WebhookEvent,
} from './interfaces/payment-provider.interface';
import {
  CreatePaymentDto,
  RefundPaymentDto,
  PaymentResponseDto,
  RefundResponseDto,
  TransactionDto,
} from './dto/payment.dto';

/**
 * Payment Service
 * 
 * This is your BUSINESS LOGIC layer. It:
 * - Handles all payment operations
 * - Persists transactions to the database
 * - Orchestrates between your app and the payment provider
 * 
 * IMPORTANT: This service ONLY knows about the IPaymentProvider interface.
 * It has NO knowledge of Stripe, PayPal, or any specific provider.
 * 
 * To change providers, you only need to change the module configuration.
 * No changes are needed in this service or any business logic.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: IPaymentProvider,
    @Inject(DATABASE_CONNECTION)
    private readonly db: any,
  ) {}

  /**
   * Create a new payment
   */
  async createPayment(dto: CreatePaymentDto): Promise<PaymentResponseDto> {
    this.logger.log(`Creating payment for reference: ${dto.referenceId}`);

    // 1. Create transaction record in pending state
    const transactionId = uuidv4();
    const newTransaction: NewTransaction = {
      id: transactionId,
      referenceId: dto.referenceId,
      amount: String(dto.amount / 100), // Store as decimal
      currency: dto.currency || 'USD',
      status: 'pending',
      provider: this.paymentProvider.providerName,
      customerId: dto.customerId,
      customerEmail: dto.customerEmail,
      paymentMethod: dto.paymentMethodType,
      metadata: dto.metadata ? JSON.stringify(dto.metadata) : null,
    };

    await this.db.insert(transactions).values(newTransaction);

    // 2. Create payment with the provider (using the interface)
    const request: CreatePaymentRequest = {
      referenceId: dto.referenceId,
      amount: dto.amount,
      currency: dto.currency || 'USD',
      customer: {
        id: dto.customerId,
        email: dto.customerEmail,
      },
      paymentMethod: dto.paymentMethodToken ? {
        type: dto.paymentMethodType || 'card',
        token: dto.paymentMethodToken,
      } : undefined,
      description: dto.description,
      metadata: dto.metadata,
      returnUrl: dto.returnUrl,
      cancelUrl: dto.cancelUrl,
    };

    const result = await this.paymentProvider.createPayment(request);

    // 3. Update transaction with provider response
    await this.db
      .update(transactions)
      .set({
        status: this.mapToDbStatus(result.status),
        providerTransactionId: result.providerTransactionId,
        errorMessage: result.error?.message,
        updatedAt: new Date(),
        ...(result.status === 'completed' && { completedAt: new Date() }),
      })
      .where(eq(transactions.id, transactionId));

    // 4. Return response
    return {
      success: result.success,
      transactionId,
      providerTransactionId: result.providerTransactionId,
      status: result.status,
      redirectUrl: result.redirectUrl,
      clientSecret: result.clientSecret,
      error: result.error,
    };
  }

  /**
   * Get payment status
   */
  async getPayment(transactionId: string): Promise<TransactionDto | null> {
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    if (!transaction) {
      return null;
    }

    return this.mapToDto(transaction);
  }

  /**
   * Get payment by reference ID (your order ID, invoice ID, etc.)
   */
  async getPaymentByReference(referenceId: string): Promise<TransactionDto | null> {
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.referenceId, referenceId));

    if (!transaction) {
      return null;
    }

    return this.mapToDto(transaction);
  }

  /**
   * Sync payment status with provider
   */
  async syncPaymentStatus(transactionId: string): Promise<PaymentResponseDto> {
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    if (!transaction || !transaction.providerTransactionId) {
      return {
        success: false,
        status: 'failed',
        error: { code: 'not_found', message: 'Transaction not found' },
      };
    }

    const result = await this.paymentProvider.getPayment({
      providerTransactionId: transaction.providerTransactionId,
    });

    // Update local status
    await this.db
      .update(transactions)
      .set({
        status: this.mapToDbStatus(result.status),
        updatedAt: new Date(),
        ...(result.status === 'completed' && { completedAt: new Date() }),
      })
      .where(eq(transactions.id, transactionId));

    return {
      success: result.success,
      transactionId,
      providerTransactionId: transaction.providerTransactionId,
      status: result.status,
    };
  }

  /**
   * Cancel a pending payment
   */
  async cancelPayment(transactionId: string, reason?: string): Promise<PaymentResponseDto> {
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    if (!transaction || !transaction.providerTransactionId) {
      return {
        success: false,
        status: 'failed',
        error: { code: 'not_found', message: 'Transaction not found' },
      };
    }

    const result = await this.paymentProvider.cancelPayment({
      providerTransactionId: transaction.providerTransactionId,
      reason,
    });

    if (result.success) {
      await this.db
        .update(transactions)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, transactionId));
    }

    return {
      success: result.success,
      transactionId,
      status: result.status,
      error: result.error,
    };
  }

  /**
   * Refund a payment (full or partial)
   */
  async refundPayment(dto: RefundPaymentDto): Promise<RefundResponseDto> {
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, dto.transactionId));

    if (!transaction || !transaction.providerTransactionId) {
      return {
        success: false,
        status: 'failed',
        error: { code: 'not_found', message: 'Transaction not found' },
      };
    }

    // Use original amount if not specified (full refund)
    const refundAmount = dto.amount || Math.round(parseFloat(transaction.amount) * 100);

    // Create refund record
    const refundId = uuidv4();
    await this.db.insert(refunds).values({
      id: refundId,
      transactionId: dto.transactionId,
      amount: String(refundAmount / 100),
      currency: transaction.currency,
      status: 'pending',
      provider: transaction.provider,
      reason: dto.reason,
    });

    // Process refund with provider
    const result = await this.paymentProvider.refundPayment({
      providerTransactionId: transaction.providerTransactionId,
      amount: refundAmount,
      currency: transaction.currency,
      reason: dto.reason,
    });

    // Update refund record
    await this.db
      .update(refunds)
      .set({
        status: result.status,
        providerRefundId: result.providerRefundId,
        errorMessage: result.error?.message,
        ...(result.status === 'completed' && { completedAt: new Date() }),
      })
      .where(eq(refunds.id, refundId));

    // Update transaction status if fully refunded
    if (result.success && refundAmount >= Math.round(parseFloat(transaction.amount) * 100)) {
      await this.db
        .update(transactions)
        .set({
          status: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, dto.transactionId));
    }

    return {
      success: result.success,
      refundId,
      status: result.status,
      error: result.error,
    };
  }

  /**
   * Handle webhook events from payment provider
   */
  async handleWebhook(payload: string | Buffer, signature: string): Promise<void> {
    const event = await this.paymentProvider.verifyWebhook(payload, signature);
    
    if (!event) {
      this.logger.warn('Invalid webhook signature or event');
      return;
    }

    this.logger.log(`Processing webhook: ${event.type}`);

    // Find transaction by provider ID
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.providerTransactionId, event.providerTransactionId));

    if (!transaction) {
      this.logger.warn(`Transaction not found for provider ID: ${event.providerTransactionId}`);
      return;
    }

    // Update based on event type
    await this.processWebhookEvent(transaction.id, event);
  }

  private async processWebhookEvent(transactionId: string, event: WebhookEvent): Promise<void> {
    const statusMap: Record<string, string> = {
      'payment.completed': 'completed',
      'payment.failed': 'failed',
      'payment.cancelled': 'cancelled',
    };

    const newStatus = statusMap[event.type];
    if (!newStatus) return;

    await this.db
      .update(transactions)
      .set({
        status: newStatus,
        updatedAt: new Date(),
        ...(newStatus === 'completed' && { completedAt: new Date() }),
      })
      .where(eq(transactions.id, transactionId));
  }

  private mapToDbStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'pending',
      'processing': 'processing',
      'requires_action': 'processing',
      'completed': 'completed',
      'failed': 'failed',
      'cancelled': 'cancelled',
    };
    return statusMap[status] || 'pending';
  }

  private mapToDto(transaction: Transaction): TransactionDto {
    return {
      id: transaction.id,
      referenceId: transaction.referenceId,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      provider: transaction.provider,
      providerTransactionId: transaction.providerTransactionId ?? undefined,
      customerEmail: transaction.customerEmail ?? undefined,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt ?? undefined,
    };
  }
}
