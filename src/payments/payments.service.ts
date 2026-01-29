import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { payments, Payment } from '../database/schema';
import {
  IPaymentProvider,
  PAYMENT_PROVIDER,
  PaymentStatus,
} from './interfaces/payment-provider.interface';
import { CreatePaymentDto, RefundPaymentDto } from './dto';

/**
 * Payment Service - Business Logic Layer
 *
 * This service contains all payment business logic and is COMPLETELY DECOUPLED
 * from any specific payment provider. It depends only on the IPaymentProvider
 * interface, which is injected at runtime.
 *
 * Key benefits:
 * - Provider can be switched without changing this code
 * - Easy to test with mock providers
 * - Business rules are centralized here
 * - Provider-specific details are abstracted away
 */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Database,
    @Inject(PAYMENT_PROVIDER)
    private paymentProvider: IPaymentProvider,
  ) {}

  /**
   * Create and process a new payment
   */
  async createPayment(dto: CreatePaymentDto): Promise<Payment> {
    const paymentId = uuidv4();
    const currency = dto.currency || 'USD';

    // Create payment record in pending state
    const [payment] = await this.db
      .insert(payments)
      .values({
        id: paymentId,
        amount: dto.amount.toString(),
        currency,
        status: 'pending',
        providerName: this.paymentProvider.providerName,
        customerId: dto.customerId,
        orderId: dto.orderId,
        description: dto.description,
        metadata: dto.metadata ? JSON.stringify(dto.metadata) : null,
      })
      .returning();

    // Process payment with the provider
    const result = await this.paymentProvider.createCharge({
      amount: Math.round(dto.amount * 100), // Convert to cents
      currency,
      customerId: dto.customerId,
      orderId: dto.orderId,
      description: dto.description,
      metadata: dto.metadata,
    });

    // Update payment with result
    const [updatedPayment] = await this.db
      .update(payments)
      .set({
        status: result.status,
        providerTransactionId: result.providerTransactionId,
        errorMessage: result.errorMessage,
        completedAt: result.status === 'completed' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId))
      .returning();

    return updatedPayment;
  }

  /**
   * Get a payment by ID
   */
  async getPayment(id: string): Promise<Payment> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.id, id));

    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }

    return payment;
  }

  /**
   * Get all payments (with optional filters in the future)
   */
  async getPayments(): Promise<Payment[]> {
    return this.db.select().from(payments);
  }

  /**
   * Refund a payment
   */
  async refundPayment(id: string, dto: RefundPaymentDto): Promise<Payment> {
    const payment = await this.getPayment(id);

    if (payment.status !== 'completed') {
      throw new Error(`Cannot refund payment with status: ${payment.status}`);
    }

    if (!payment.providerTransactionId) {
      throw new Error('Payment has no provider transaction ID');
    }

    const result = await this.paymentProvider.refund({
      providerTransactionId: payment.providerTransactionId,
      amount: dto.amount ? Math.round(dto.amount * 100) : undefined,
      reason: dto.reason,
    });

    const [updatedPayment] = await this.db
      .update(payments)
      .set({
        status: result.success ? 'refunded' : payment.status,
        errorMessage: result.errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, id))
      .returning();

    return updatedPayment;
  }

  /**
   * Cancel a pending payment
   */
  async cancelPayment(id: string): Promise<Payment> {
    const payment = await this.getPayment(id);

    if (payment.status !== 'pending' && payment.status !== 'processing') {
      throw new Error(`Cannot cancel payment with status: ${payment.status}`);
    }

    let newStatus: PaymentStatus = 'cancelled';

    // If we have a provider transaction, try to cancel it
    if (payment.providerTransactionId) {
      const result = await this.paymentProvider.cancel({
        providerTransactionId: payment.providerTransactionId,
      });
      newStatus = result.success ? 'cancelled' : payment.status;
    }

    const [updatedPayment] = await this.db
      .update(payments)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, id))
      .returning();

    return updatedPayment;
  }

  /**
   * Sync payment status with provider
   * Useful for webhooks or manual reconciliation
   */
  async syncPaymentStatus(id: string): Promise<Payment> {
    const payment = await this.getPayment(id);

    if (!payment.providerTransactionId) {
      return payment;
    }

    const transaction = await this.paymentProvider.getTransaction({
      providerTransactionId: payment.providerTransactionId,
    });

    if (!transaction) {
      return payment;
    }

    const [updatedPayment] = await this.db
      .update(payments)
      .set({
        status: transaction.status,
        completedAt: transaction.status === 'completed' ? new Date() : payment.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, id))
      .returning();

    return updatedPayment;
  }

  /**
   * Get the current payment provider name
   */
  getProviderName(): string {
    return this.paymentProvider.providerName;
  }

  /**
   * Verify the payment provider connection
   */
  async verifyProviderConnection(): Promise<boolean> {
    return this.paymentProvider.verifyConnection();
  }
}
