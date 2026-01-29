import { pgTable, uuid, varchar, decimal, timestamp, text, pgEnum } from 'drizzle-orm/pg-core';

// Enums
export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded',
  'cancelled',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'card',
  'bank_transfer',
  'wallet',
]);

// Transactions table
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Business reference - your internal order/invoice ID
  referenceId: varchar('reference_id', { length: 255 }).notNull(),
  
  // Amount in cents/smallest currency unit
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  
  // Status tracking
  status: transactionStatusEnum('status').notNull().default('pending'),
  
  // Provider info (which provider processed this)
  provider: varchar('provider', { length: 50 }).notNull(),
  providerTransactionId: varchar('provider_transaction_id', { length: 255 }),
  
  // Payment details
  paymentMethod: paymentMethodEnum('payment_method'),
  
  // Customer info
  customerId: varchar('customer_id', { length: 255 }),
  customerEmail: varchar('customer_email', { length: 255 }),
  
  // Metadata and error tracking
  metadata: text('metadata'), // JSON string for flexible data
  errorMessage: text('error_message'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// Refunds table
export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  transactionId: uuid('transaction_id').references(() => transactions.id).notNull(),
  
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  
  status: transactionStatusEnum('status').notNull().default('pending'),
  
  provider: varchar('provider', { length: 50 }).notNull(),
  providerRefundId: varchar('provider_refund_id', { length: 255 }),
  
  reason: text('reason'),
  errorMessage: text('error_message'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// Type exports for use in application
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
