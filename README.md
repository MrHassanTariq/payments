# Payment Service

A **decoupled, provider-agnostic payment infrastructure** built with NestJS. Switch between Stripe, PayPal, Airwallex (or any provider) without changing business logic.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Application                         │
│                     (Business Logic Layer)                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PaymentService                             │
│            (Uses IPaymentProvider interface only)               │
│                    NO PROVIDER KNOWLEDGE                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    IPaymentProvider                             │
│                      (Interface)                                │
│   createPayment | getPayment | cancelPayment | refundPayment   │
└───────┬─────────────────────┼─────────────────────┬─────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────────┐
│StripeProvider │   │ PayPalProvider│   │ AirwallexProvider │
│   (Adapter)   │   │   (Adapter)   │   │     (Adapter)     │
└───────────────┘   └───────────────┘   └───────────────────┘
```

## Key Design Principles

1. **Strategy Pattern**: All providers implement `IPaymentProvider` interface
2. **Dependency Inversion**: Business logic depends on abstractions, not concrete implementations
3. **Single Responsibility**: Each provider adapter handles only its provider's API
4. **Open/Closed**: Add new providers without modifying existing code

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Generate database schema
npm run db:push

# Start development server
npm run start:dev
```

## Configuration

Set the `PAYMENT_PROVIDER` environment variable to switch providers:

```bash
# Use Stripe
PAYMENT_PROVIDER=stripe

# Use PayPal
PAYMENT_PROVIDER=paypal

# Use Airwallex
PAYMENT_PROVIDER=airwallex
```

**That's it!** No code changes required.

## API Endpoints

### Create Payment
```bash
POST /payments
{
  "referenceId": "order_123",
  "amount": 1000,           # $10.00 in cents
  "currency": "USD",
  "customerEmail": "customer@example.com",
  "description": "Order #123",
  "returnUrl": "https://yoursite.com/success",
  "cancelUrl": "https://yoursite.com/cancel"
}
```

### Get Payment
```bash
GET /payments/:transactionId
```

### Get by Reference
```bash
GET /payments/reference/:referenceId
```

### Cancel Payment
```bash
POST /payments/:transactionId/cancel
{ "reason": "Customer requested" }
```

### Refund Payment
```bash
POST /payments/refund
{
  "transactionId": "uuid",
  "amount": 500,           # Partial refund: $5.00
  "reason": "Duplicate charge"
}
```

### Webhook
```bash
POST /payments/webhook
# Raw body with signature headers
```

## Adding a New Provider

1. Create `src/payment/providers/newprovider.provider.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { IPaymentProvider, ... } from '../interfaces/payment-provider.interface';

@Injectable()
export class NewProvider implements IPaymentProvider {
  readonly providerName = 'newprovider';
  
  async createPayment(request: CreatePaymentRequest): Promise<PaymentResult> {
    // Implement provider-specific logic
  }
  
  // ... implement other methods
}
```

2. Register in `payment.module.ts`:

```typescript
const providerMap = {
  stripe: StripeProvider,
  paypal: PayPalProvider,
  airwallex: AirwallexProvider,
  newprovider: NewProvider,  // Add here
};
```

3. Set `PAYMENT_PROVIDER=newprovider` in your environment.

## Database Schema

Using Drizzle ORM with PostgreSQL:

- **transactions**: Payment records with status tracking
- **refunds**: Refund records linked to transactions

```bash
# Generate migrations
npm run db:generate

# Apply migrations
npm run db:migrate

# Open Drizzle Studio
npm run db:studio
```

## Project Structure

```
src/
├── database/
│   ├── schema.ts          # Drizzle schema definitions
│   └── database.module.ts # Database connection
├── payment/
│   ├── interfaces/
│   │   └── payment-provider.interface.ts  # Core abstraction
│   ├── providers/
│   │   ├── stripe.provider.ts    # Stripe adapter
│   │   ├── paypal.provider.ts    # PayPal adapter
│   │   └── airwallex.provider.ts # Airwallex adapter
│   ├── dto/
│   │   └── payment.dto.ts        # Request/Response DTOs
│   ├── payment.service.ts        # Business logic (provider-agnostic)
│   ├── payment.controller.ts     # REST API
│   └── payment.module.ts         # Module with provider factory
├── app.module.ts
└── main.ts
```

## Why This Architecture?

❌ **Without abstraction:**
```typescript
// Business logic tightly coupled to Stripe
const stripe = new Stripe(key);
await stripe.paymentIntents.create({ ... });
// Changing to PayPal = rewrite everything
```

✅ **With this architecture:**
```typescript
// Business logic uses interface
await this.paymentProvider.createPayment({ ... });
// Changing providers = change one env variable
```

## License

ISC
