import { pgTable, varchar, decimal, timestamp, pgEnum, uuid, text } from 'drizzle-orm/pg-core';

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded',
  'cancelled',
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Amount in smallest currency unit (cents for USD)
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),

  // Status tracking
  status: paymentStatusEnum('status').notNull().default('pending'),

  // Provider information (stored for reference, not for business logic)
  providerName: varchar('provider_name', { length: 50 }).notNull(),
  providerTransactionId: varchar('provider_transaction_id', { length: 255 }),

  // Customer/order reference
  customerId: varchar('customer_id', { length: 255 }),
  orderId: varchar('order_id', { length: 255 }),
  description: text('description'),

  // Metadata for flexible additional data
  metadata: text('metadata'),

  // Error tracking
  errorMessage: text('error_message'),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
