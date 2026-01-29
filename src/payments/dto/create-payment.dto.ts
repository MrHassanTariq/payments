export class CreatePaymentDto {
  amount: number;
  currency?: string;
  customerId?: string;
  orderId?: string;
  description?: string;
  metadata?: Record<string, string>;
}
