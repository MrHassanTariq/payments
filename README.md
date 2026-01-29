# Payment Service

A scalable, provider-agnostic payment infrastructure built with NestJS, Drizzle ORM, and PostgreSQL.

## Architecture

This payment service follows a **Strategy Pattern** combined with **Dependency Injection** to ensure the business logic is completely decoupled from any specific payment provider.

```
┌─────────────────────────────────────────────────────────────────┐
│                        PaymentsController                        │
│                    (REST API Endpoints)                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        PaymentsService                           │
│              (Business Logic - Provider Agnostic)                │
│                                                                  │
│  • Creates payments          • Processes refunds                 │
│  • Manages payment lifecycle • Syncs with provider               │
│  • Stores in database        • NO provider-specific code         │
└─────────────────────────────────────────────────────────────────┘
                                │
                    Depends on IPaymentProvider
                          (Interface)
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
    │StripeProvider│    │PayPalProvider│    │ NewProvider  │
    │              │    │              │    │              │
    │ Implements   │    │ Implements   │    │ Implements   │
    │IPaymentProv. │    │IPaymentProv. │    │IPaymentProv. │
    └──────────────┘    └──────────────┘    └──────────────┘
```

## Key Benefits

1. **Provider Independence**: Switch from Stripe to PayPal (or any other provider) by changing a single environment variable
2. **No Business Logic Changes**: The `PaymentsService` never needs modification when adding/changing providers
3. **Easy Testing**: Mock the `IPaymentProvider` interface for unit tests
4. **Type Safety**: TypeScript interfaces ensure all providers implement the required methods

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Installation

```bash
npm install
```

### Configuration

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/payments

# Provider selection (stripe | paypal)
PAYMENT_PROVIDER=stripe

# Stripe (if using Stripe)
STRIPE_SECRET_KEY=sk_test_xxx
```

### Database Setup

```bash
# Generate migrations
npm run db:generate

# Apply migrations
npm run db:migrate
```

### Running

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/payments` | Create a new payment |
| GET | `/payments` | List all payments |
| GET | `/payments/:id` | Get payment by ID |
| POST | `/payments/:id/refund` | Refund a payment |
| POST | `/payments/:id/cancel` | Cancel a payment |
| POST | `/payments/:id/sync` | Sync status with provider |
| GET | `/payments/provider/info` | Get provider info |

### Create Payment

```bash
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 99.99,
    "currency": "USD",
    "customerId": "cust_123",
    "description": "Order #456"
  }'
```

## Adding a New Provider

1. Create a new provider file in `src/payments/providers/`:

```typescript
// src/payments/providers/airwallex.provider.ts
import { Injectable } from '@nestjs/common';
import { IPaymentProvider, ... } from '../interfaces/payment-provider.interface';

@Injectable()
export class AirwallexProvider implements IPaymentProvider {
  readonly providerName = 'airwallex';

  async createCharge(params: CreateChargeParams): Promise<ChargeResult> {
    // Implement Airwallex-specific logic
  }

  // Implement other interface methods...
}
```

2. Register in `payments.module.ts`:

```typescript
// Add to providers array
AirwallexProvider,

// Add to factory switch statement
case 'airwallex':
  return airwallexProvider;
```

3. Set environment variable:

```env
PAYMENT_PROVIDER=airwallex
```

That's it! The business logic remains unchanged.

## Project Structure

```
src/
├── main.ts                          # Application entry
├── app.module.ts                    # Root module
├── database/
│   ├── database.module.ts           # Drizzle setup
│   └── schema.ts                    # Database schema
└── payments/
    ├── payments.module.ts           # Module wiring
    ├── payments.controller.ts       # REST endpoints
    ├── payments.service.ts          # Business logic
    ├── dto/                         # Request/Response DTOs
    │   ├── create-payment.dto.ts
    │   └── refund-payment.dto.ts
    ├── interfaces/
    │   └── payment-provider.interface.ts  # Provider contract
    └── providers/
        ├── stripe.provider.ts       # Stripe implementation
        └── paypal.provider.ts       # PayPal implementation
```
